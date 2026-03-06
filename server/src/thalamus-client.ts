import { logger } from './structured-pino-logger'

const THALAMUS_BASE_URL = process.env.THALAMUS_URL || 'http://localhost:3013'
const THALAMUS_MODEL = process.env.THALAMUS_MODEL || 'grok-code-fast-1'
const THALAMUS_API_KEY = process.env.THALAMUS_API_KEY || 'sk-placeholder'

const MAX_CONCURRENCY = parseInt(process.env.THALAMUS_MAX_CONCURRENCY || '1', 10)
const QUEUE_TIMEOUT_MS = parseInt(process.env.THALAMUS_QUEUE_TIMEOUT_MS || '60000', 10)
const MIN_INTERVAL_MS = parseInt(process.env.THALAMUS_MIN_INTERVAL_MS || '500', 10)

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ThalamusResponse {
  message: ChatMessage
  finishReason: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

// ─── Request Queue / Semaphore ───

let activeCount = 0
let lastRequestEndMs = 0
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void; reqId: string }> = []

function releaseSlot(reqId: string) {
  activeCount--
  lastRequestEndMs = Date.now()
  logger.info('thalamus_queue_released', { reqId, activeCount, queueLength: waitQueue.length })

  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!
    activeCount++
    logger.info('thalamus_queue_acquired', { reqId: next.reqId, activeCount, remainingQueue: waitQueue.length })
    next.resolve()
  }
}

async function acquireSlot(reqId: string): Promise<void> {
  logger.info('thalamus_queue_enqueued', { reqId, activeCount, queueLength: waitQueue.length, maxConcurrency: MAX_CONCURRENCY })

  if (activeCount < MAX_CONCURRENCY) {
    activeCount++
    logger.info('thalamus_queue_acquired', { reqId, activeCount, waitMs: 0, remainingQueue: waitQueue.length })
    return
  }

  const enqueueMs = Date.now()
  return new Promise<void>((resolve, reject) => {
    const entry = { resolve, reject, reqId }
    waitQueue.push(entry)

    const timer = setTimeout(() => {
      const idx = waitQueue.indexOf(entry)
      if (idx >= 0) {
        waitQueue.splice(idx, 1)
        const waitMs = Date.now() - enqueueMs
        logger.warn('thalamus_queue_timeout', { reqId, waitMs, queueLength: waitQueue.length, activeCount })
        reject(new Error(`Thalamus queue timeout: waited ${waitMs}ms (limit ${QUEUE_TIMEOUT_MS}ms), ${waitQueue.length} still queued`))
      }
    }, QUEUE_TIMEOUT_MS)

    const origResolve = entry.resolve
    entry.resolve = () => {
      clearTimeout(timer)
      const waitMs = Date.now() - enqueueMs
      logger.info('thalamus_queue_wait_done', { reqId, waitMs })
      origResolve()
    }
  })
}

async function enforceMinInterval(): Promise<void> {
  if (MIN_INTERVAL_MS <= 0) return
  const elapsed = Date.now() - lastRequestEndMs
  if (elapsed < MIN_INTERVAL_MS && lastRequestEndMs > 0) {
    const sleepMs = MIN_INTERVAL_MS - elapsed
    logger.debug('thalamus_queue_throttle', { sleepMs, minInterval: MIN_INTERVAL_MS })
    await Bun.sleep(sleepMs)
  }
}

// ─── Public API ───

export async function callThalamus(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model?: string,
): Promise<ThalamusResponse> {
  const reqId = `tlm_${crypto.randomUUID().slice(0, 8)}`
  const selectedModel = model || THALAMUS_MODEL
  const enqueueMs = Date.now()

  await acquireSlot(reqId)

  try {
    await enforceMinInterval()

    const startMs = Date.now()

    const systemPromptLen =
      messages.length > 0 && messages[0].role === 'system'
        ? (messages[0].content ?? '').length
        : undefined

    const body = {
      model: selectedModel,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = { role: m.role }
        if (m.content !== undefined) msg.content = m.content
        if (m.tool_calls) msg.tool_calls = m.tool_calls
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
        return msg
      }),
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 8192,
      stream: false,
    }

    const requestUrl = `${THALAMUS_BASE_URL}/v1/chat/completions`
    const bodyPreview = JSON.stringify(body).slice(0, 200)

    logger.info('thalamus_request_start', {
      reqId,
      model: selectedModel,
      messageCount: messages.length,
      toolCount: tools.length,
      systemPromptLen,
      bodyPreview,
      requestUrl,
      queueWaitMs: startMs - enqueueMs,
    })

    const resp = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${THALAMUS_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const respStatus = resp.status
    const respContentType = resp.headers.get('content-type') ?? undefined

    if (!resp.ok) {
      const errorText = await resp.text()
      logger.error('thalamus_request_error', {
        reqId,
        status: respStatus,
        contentType: respContentType,
        error: errorText,
        latencyMs: Date.now() - startMs,
      })
      throw new Error(`Thalamus API error ${respStatus}: ${errorText}`)
    }

    logger.debug('thalamus_response', {
      reqId,
      status: respStatus,
      contentType: respContentType,
    })

    const data = await resp.json() as any

    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('Thalamus returned no choices')
    }

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: choice.message?.content ?? null,
    }
    if (choice.message?.tool_calls?.length > 0) {
      assistantMsg.tool_calls = choice.message.tool_calls
    }

    const result: ThalamusResponse = {
      message: assistantMsg,
      finishReason: choice.finish_reason || 'stop',
      usage: data.usage,
    }

    logger.info('thalamus_request_done', {
      reqId,
      status: respStatus,
      contentType: respContentType,
      finishReason: result.finishReason,
      toolCallCount: assistantMsg.tool_calls?.length ?? 0,
      contentLen: (assistantMsg.content || '').length,
      usage: result.usage,
      latencyMs: Date.now() - startMs,
      totalMs: Date.now() - enqueueMs,
    })

    return result
  } finally {
    releaseSlot(reqId)
  }
}
