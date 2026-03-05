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
  const shellCmd = `export PATH="$HOME/.claude/local:$HOME/.local/bin:$PATH"; exec ${program}`
  runTmux(['new-session', '-d', '-s', name, '-c', dir, '-x', '120', '-y', '40', '--', 'zsh', '-c', shellCmd])
  try { runTmux(['set-option', '-t', name, 'history-limit', '10000']) } catch {}
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

export async function startCCInstance(instance: CCInstance, workDir: string, command = 'claude'): Promise<void> {
  ensureTmuxServer()
  if (tmuxSessionExists(instance.tmuxSessionName)) {
    killTmuxSession(instance.tmuxSessionName)
  }
  createTmuxSession(instance.tmuxSessionName, workDir, command)

  try {
    attachPipePane(instance.tmuxSessionName, instance.outputFilePath)
    logger.info({ name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath, event: 'cc_pipe_pane_attached' })
  } catch (err) {
    logger.warn({ name: instance.name, error: err instanceof Error ? err.message : String(err), event: 'cc_pipe_pane_attach_failed' })
  }

  logger.info({ name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath, event: 'cc_instance_started' })
}

export async function waitCCReady(instance: CCInstance, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let trustHandled = false

  while (Date.now() < deadline) {
    refreshCCInstance(instance)

    if (instance.status === 'trust-prompt' && !trustHandled) {
      sendSpecialKey(instance.tmuxSessionName, 'Enter')
      trustHandled = true
      await Bun.sleep(2000)
      continue
    }

    if (isIdleStatus(instance.status)) {
      logger.info({ name: instance.name, status: instance.status }, 'CC instance ready')
      return
    }
    await Bun.sleep(500)
  }
  throw new Error(`${instance.name}: timed out waiting for CC to become ready (last status: ${instance.status})`)
}

export function refreshCCInstance(instance: CCInstance): void {
  try {
    const content = capturePaneContent(instance.tmuxSessionName)
    instance.content = content
    instance.contentHash = createHash('sha256').update(content).digest('hex')
    instance.status = detectCCStatus(content)
  } catch {
    instance.status = 'unknown'
  }
}

export function stopCCInstance(instance: CCInstance): void {
  try { runTmux(['pipe-pane', '-t', instance.tmuxSessionName]) } catch {}
  killTmuxSession(instance.tmuxSessionName)
  logger.info({ name: instance.name, session: instance.tmuxSessionName, outputFile: instance.outputFilePath, event: 'cc_instance_stopped' })
}

export function sendInputToCCInstance(instance: CCInstance, text: string): void {
  sendKeys(instance.tmuxSessionName, text)
}

export { ensureTmuxServer, tmuxSessionExists, killTmuxSession, sendKeys, sendSpecialKey, capturePaneContent, CC_OUTPUT_DIR }
