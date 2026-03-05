const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

export type CCStatus = 'unknown' | 'idle' | 'processing' | 'completed' | 'permission' | 'trust-prompt'

const PROCESSING_PATTERN = /[✶✢✽✻·✳⠿⠇⠋⠙⠸⠴⠦⠧⠖⠏⠹⠼⠷⠾⠽⠻].*…/
const RESPONSE_PATTERN = /⏺\s/
const IDLE_PROMPT_PATTERN = /^[❯>]\s*$/m
const SHORTCUTS_HINT = '? for shortcuts'
const WAITING_ANSWER_PATTERN = /❯\s*\d+\./
const PERMISSION_PATTERN = /(?:Allow|Do you want to|Yes.*No|\[y\/n\]|\[Y\/n\])/i
const TRUST_PROMPT_PATTERN = /(?:trust.*folder|trust this folder|I trust this)/i

export function detectCCStatus(content: string): CCStatus {
  if (!content) return 'unknown'
  const clean = stripAnsi(content)
  if (TRUST_PROMPT_PATTERN.test(clean)) return 'trust-prompt'
  if (PROCESSING_PATTERN.test(clean)) return 'processing'
  if (WAITING_ANSWER_PATTERN.test(clean)) return 'processing'
  if (PERMISSION_PATTERN.test(clean)) return 'permission'
  const hasIdlePrompt = IDLE_PROMPT_PATTERN.test(clean) || clean.includes(SHORTCUTS_HINT)
  const hasResponse = RESPONSE_PATTERN.test(clean)
  if (hasResponse && hasIdlePrompt) return 'completed'
  if (hasIdlePrompt) return 'idle'
  return 'processing'
}

export function isIdleStatus(status: CCStatus): boolean {
  return status === 'idle' || status === 'completed'
}
