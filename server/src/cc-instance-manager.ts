import { createHash } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { detectCCStatus, isIdleStatus, type CCStatus } from './cc-status-detector'
import { logger } from './structured-pino-logger'

const CC_OUTPUT_DIR = join(process.env.HOME || '/tmp', '.vibe-vibing', 'cc-outputs')

function runTmux(args: string[]): string {
  const result = Bun.spawnSync(['tmux', ...args])
  if (result.exitCode !== 0) {
    throw new Error(`tmux ${args.join(' ')}: ${result.stderr.toString().trim()}`)
  }
  return result.stdout.toString()
}

function tmuxSessionExists(name: string): boolean {
  const result = Bun.spawnSync(['tmux', 'has-session', `-t=${name}`])
  return result.exitCode === 0
}

function ensureTmuxServer(): void {
  Bun.spawnSync(['tmux', 'start-server'])
}

function createTmuxSession(name: string, dir: string, program: string): void {
  if (tmuxSessionExists(name)) {
    throw new Error(`tmux session "${name}" already exists`)
  }
  const shellCmd = `source ~/.zshrc 2>/dev/null; [ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" && nvm use 22 2>/dev/null; export PATH="$HOME/.claude/local:$HOME/.local/bin:$PATH"; exec ${program}`
  runTmux(['new-session', '-d', '-s', name, '-c', dir, '-x', '120', '-y', '40', '--', 'zsh', '-c', shellCmd])
  try { runTmux(['set-option', '-t', name, 'history-limit', '10000']) } catch {}
  try { runTmux(['set-option', '-t', name, 'status', 'off']) } catch {}
  try { runTmux(['set-option', '-t', name, 'prefix', 'None']) } catch {}
  try { runTmux(['set-option', '-t', name, 'prefix2', 'None']) } catch {}
}

function capturePaneContent(session: string): string {
  return runTmux(['capture-pane', '-p', '-e', '-J', '-t', session])
}

function sendKeys(session: string, text: string): void {
  runTmux(['send-keys', '-l', '-t', session, text])
  runTmux(['send-keys', '-t', session, 'Enter'])
}

function sendSpecialKey(session: string, key: string): void {
  runTmux(['send-keys', '-t', session, key])
}

function killTmuxSession(session: string): void {
  if (!tmuxSessionExists(session)) return
  runTmux(['kill-session', '-t', session])
}

export interface CCInstance {
  name: string
  tmuxSessionName: string
  status: CCStatus
  content: string
  contentHash: string
  agentType: string
  memberIndex: number
  outputFilePath: string
}

export function createCCInstance(name: string, tmuxSessionName: string, agentType: string, memberIndex: number): CCInstance {
  if (!existsSync(CC_OUTPUT_DIR)) {
    mkdirSync(CC_OUTPUT_DIR, { recursive: true })
  }
  const outputFilePath = join(CC_OUTPUT_DIR, `${tmuxSessionName}.txt`)
  return {
    name,
    tmuxSessionName,
    status: 'unknown',
    content: '',
    contentHash: '',
    agentType,
    memberIndex,
    outputFilePath,
  }
}

function attachPipePane(session: string, outputFile: string): void {
  Bun.spawnSync(['bash', '-c', `> "${outputFile}"`])
  runTmux(['pipe-pane', '-t', session, `-o`, `cat >> "${outputFile}"`])
}

/**
 * Start (or reuse) a CC instance.
 * If the tmux session already exists and CC is idle inside it, we simply
 * re-attach the pipe-pane so monitoring resumes — the terminal scrollback
 * with all prior conversation history is preserved.
 * Otherwise we create a fresh tmux session with the given command.
 */
export async function startCCInstance(instance: CCInstance, workDir: string, command = 'claude'): Promise<void> {
  ensureTmuxServer()

  const sessionAlive = tmuxSessionExists(instance.tmuxSessionName)

  if (sessionAlive) {
    // Try to detect whether the existing session still has a running Claude
    try {
      const content = capturePaneContent(instance.tmuxSessionName)
      const status = detectCCStatus(content)
      if (isIdleStatus(status) || status === 'processing' || status === 'completed') {
        // Session is alive with a Claude inside — reuse it
        instance.content = content
        instance.status = status
        logger.info('cc_instance_reused', { name: instance.name, session: instance.tmuxSessionName, status })
        await reattachPipePane(instance)
        return
      }
    } catch {
      // capture failed, fall through to kill+recreate
    }
    killTmuxSession(instance.tmuxSessionName)
    logger.info('cc_instance_killed_stale', { name: instance.name, session: instance.tmuxSessionName })
  }

  createTmuxSession(instance.tmuxSessionName, workDir, command)
  await Bun.sleep(1000)
  await reattachPipePane(instance)

  logger.info('cc_instance_started', { name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath, reused: false })
}

async function reattachPipePane(instance: CCInstance): Promise<void> {
  try {
    attachPipePane(instance.tmuxSessionName, instance.outputFilePath)
    logger.info('cc_pipe_pane_attached', { name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath })
  } catch (err) {
    logger.warn('cc_pipe_pane_attach_failed', { name: instance.name, error: err instanceof Error ? err.message : String(err) })
    await Bun.sleep(2000)
    try {
      attachPipePane(instance.tmuxSessionName, instance.outputFilePath)
      logger.info('cc_pipe_pane_attached_retry', { name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath })
    } catch (retryErr) {
      logger.warn('cc_pipe_pane_attach_retry_failed', { name: instance.name, error: retryErr instanceof Error ? retryErr.message : String(retryErr) })
    }
  }
}

export async function waitCCReady(instance: CCInstance, timeoutMs = 120000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let trustHandled = false
  let unknownConsecutiveCount = 0
  let pollAttempt = 0

  await Bun.sleep(3000)

  while (Date.now() < deadline) {
    pollAttempt += 1
    refreshCCInstance(instance, pollAttempt)

    if (instance.status === 'unknown') {
      unknownConsecutiveCount += 1
      if (unknownConsecutiveCount > 10) {
        try {
          runTmux(['pipe-pane', '-t', instance.tmuxSessionName])
          await Bun.sleep(500)
          attachPipePane(instance.tmuxSessionName, instance.outputFilePath)
          unknownConsecutiveCount = 0
          logger.info('cc_pipe_pane_reattached_after_unknown', { name: instance.name })
        } catch (reattachErr) {
          logger.warn('cc_pipe_pane_reattach_failed', { name: instance.name, error: reattachErr instanceof Error ? reattachErr.message : String(reattachErr) })
        }
      }
    } else {
      unknownConsecutiveCount = 0
    }

    if (pollAttempt % 10 === 0) {
      const tailPreview = (instance.content ?? '').split('\n').slice(-8).join(' | ')
      logger.info('cc_wait_ready_poll', { name: instance.name, status: instance.status, pollAttempt, elapsedMs: Date.now() - (deadline - timeoutMs), tail: tailPreview })
    }

    if (instance.status === 'trust-prompt' && !trustHandled) {
      sendSpecialKey(instance.tmuxSessionName, 'Enter')
      trustHandled = true
      await Bun.sleep(2000)
      continue
    }

    if (isIdleStatus(instance.status)) {
      logger.info('cc_instance_ready', { name: instance.name, status: instance.status })
      return
    }
    await Bun.sleep(500)
  }

  const sessionExists = tmuxSessionExists(instance.tmuxSessionName)
  const lastContentTail = (instance.content ?? '').split('\n').slice(-15).join('\n')
  logger.error('cc_wait_ready_timeout', {
    name: instance.name,
    status: instance.status,
    sessionExists,
    lastContentTail,
    pollAttempt,
  })
  throw new Error(`${instance.name}: timed out waiting for CC to become ready (last status: ${instance.status})`)
}

export function refreshCCInstance(instance: CCInstance, pollAttempt?: number): void {
  try {
    const content = capturePaneContent(instance.tmuxSessionName)
    instance.content = content
    instance.contentHash = createHash('sha256').update(content).digest('hex')
    instance.status = detectCCStatus(content)
    if (pollAttempt != null) {
      if (pollAttempt % 5 === 0) {
        logger.info('cc_refresh_poll', { name: instance.name, status: instance.status, pollAttempt })
      } else {
        logger.debug('cc_refresh_poll', { name: instance.name, status: instance.status, pollAttempt })
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.warn('cc_capture_pane_failed', { name: instance.name, error: errMsg, pollAttempt })
    instance.status = 'unknown'
  }
}

/**
 * Detach monitoring from a CC instance without killing the tmux session.
 * The tmux session stays alive so it can be reused on next Start,
 * preserving the terminal scrollback (conversation history).
 */
export function stopCCInstance(instance: CCInstance, keepSession = true): void {
  try { runTmux(['pipe-pane', '-t', instance.tmuxSessionName]) } catch {}
  if (!keepSession) {
    killTmuxSession(instance.tmuxSessionName)
  }
  logger.info('cc_instance_stopped', { name: instance.name, session: instance.tmuxSessionName, kept: keepSession })
}

export function sendInputToCCInstance(instance: CCInstance, text: string): void {
  sendKeys(instance.tmuxSessionName, text)
}

export { ensureTmuxServer, tmuxSessionExists, killTmuxSession, sendKeys, sendSpecialKey, capturePaneContent, CC_OUTPUT_DIR }
