import path from 'node:path'

const homeDir = process.env.HOME || process.env.USERPROFILE || ''

export function resolveProjectPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (
    homeDir &&
    (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\'))
  ) {
    const remainder = trimmed === '~' ? '' : trimmed.slice(2)
    return path.resolve(path.join(homeDir, remainder))
  }

  return path.resolve(trimmed)
}
