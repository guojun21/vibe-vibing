const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b[>=<]|\x0f|\x0e/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, '')
}

export type CCStatus = 'unknown' | 'idle' | 'processing' | 'completed' | 'permission' | 'trust-prompt'

const PROCESSING_PATTERN = /[✶✢✽✻·✳⠿⠇⠋⠙⠸⠴⠦⠧⠖⠏⠹⠼⠷⠾⠽⠻].*…/
const RESPONSE_PATTERN = /⏺\s/
const IDLE_PROMPT_PATTERN = /^[❯>]\s*$/m
const SHORTCUTS_HINT = '? for shortcuts'
const WAITING_ANSWER_PATTERN = /❯\s*\d+\./
const PERMISSION_PATTERN = /(?:Allow|Do you want to|Yes.*No|\[y\/n\]|\[Y\/n\])/i
const TRUST_PROMPT_PATTERN = /(?:trust.*folder|trust this folder|I trust this|Do you trust|safety check.*trust|project you created or one you trust)/i

const TAIL_LINES = 20

function tailContent(text: string): string {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  return lines.slice(-TAIL_LINES).join('\n')
}

export function detectCCStatus(content: string): CCStatus {
  if (!content) return 'unknown'
  const clean = stripAnsi(content)
  const tail = tailContent(clean)

  // Idle/completed first — if the prompt is visible, CC is ready regardless of
  // historical trust-prompt text still in the scrollback buffer
  const hasIdlePrompt = IDLE_PROMPT_PATTERN.test(tail) || tail.includes(SHORTCUTS_HINT)
  const hasResponse = RESPONSE_PATTERN.test(clean)
  if (hasResponse && hasIdlePrompt) return 'completed'
  if (hasIdlePrompt) return 'idle'

  // Trust prompt and permission — only match if CC is NOT idle
  if (TRUST_PROMPT_PATTERN.test(tail)) return 'trust-prompt'
  if (PERMISSION_PATTERN.test(tail)) return 'permission'

  if (PROCESSING_PATTERN.test(tail)) return 'processing'
  if (WAITING_ANSWER_PATTERN.test(tail)) return 'processing'

  return 'processing'
}

export function isIdleStatus(status: CCStatus): boolean {
  return status === 'idle' || status === 'completed'
}
