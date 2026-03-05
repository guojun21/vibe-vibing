import { logger } from './structured-pino-logger'

const THALAMUS_BASE_URL = process.env.THALAMUS_URL || 'http://localhost:3013'
const THALAMUS_MODEL = process.env.THALAMUS_MODEL || 'claude-sonnet-4-20250514'
const THALAMUS_API_KEY = process.env.THALAMUS_API_KEY || 'sk-placeholder'

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

export async function callThalamus(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model?: string,
): Promise<ThalamusResponse> {
  const startMs = Date.now()
  const reqId = `tlm_${crypto.randomUUID().slice(0, 8)}`
  const selectedModel = model || THALAMUS_MODEL

  logger.info('thalamus_request_start', {
    reqId,
    model: selectedModel,
    messageCount: messages.length,
    toolCount: tools.length,
  })

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

  const resp = await fetch(`${THALAMUS_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${THALAMUS_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errorText = await resp.text()
    logger.error('thalamus_request_error', { reqId, status: resp.status, error: errorText, latencyMs: Date.now() - startMs })
    throw new Error(`Thalamus API error ${resp.status}: ${errorText}`)
  }

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
    finishReason: result.finishReason,
    toolCallCount: assistantMsg.tool_calls?.length ?? 0,
    contentLen: (assistantMsg.content || '').length,
    usage: result.usage,
    latencyMs: Date.now() - startMs,
  })

  return result
}
