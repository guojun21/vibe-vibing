#!/usr/bin/env bun
/**
 * Agent Tool: Read Team CC Outputs
 *
 * This is a tool designed to be called by an outer agent (e.g. a Delegate Agent)
 * to inspect what each CC instance in a team is doing.
 *
 * Input (JSON via stdin or CLI args):
 *   { "action": "list" }
 *   { "action": "read", "sessionName": "abc12345-cc-0" }
 *   { "action": "read", "sessionName": "abc12345-cc-0", "tail": 50 }
 *   { "action": "read-team", "teamId": "abc12345-xxxx-..." }
 *   { "action": "snapshot", "sessionName": "abc12345-cc-0" }  // capture-pane live snapshot
 *
 * Output: JSON to stdout
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const CC_OUTPUT_DIR = join(process.env.HOME || '/tmp', '.vibe-vibing', 'cc-outputs')

interface ToolInput {
  action: 'list' | 'read' | 'read-team' | 'snapshot'
  sessionName?: string
  teamId?: string
  tail?: number
}

interface FileInfo {
  sessionName: string
  filePath: string
  sizeBytes: number
  lastModified: string
  lastLine: string
}

function listFiles(): FileInfo[] {
  if (!existsSync(CC_OUTPUT_DIR)) return []
  return readdirSync(CC_OUTPUT_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const filePath = join(CC_OUTPUT_DIR, f)
      const stat = statSync(filePath)
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      return {
        sessionName: basename(f, '.txt'),
        filePath,
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
        lastLine: lines[lines.length - 1] || '',
      }
    })
}

function readFile(sessionName: string, tailLines?: number): { content: string; lineCount: number } {
  const filePath = join(CC_OUTPUT_DIR, `${sessionName}.txt`)
  if (!existsSync(filePath)) {
    return { content: `[ERROR] File not found: ${filePath}`, lineCount: 0 }
  }
  const raw = readFileSync(filePath, 'utf-8')
  const lines = raw.split('\n')
  if (tailLines && tailLines > 0) {
    return { content: lines.slice(-tailLines).join('\n'), lineCount: lines.length }
  }
  return { content: raw, lineCount: lines.length }
}

function tmuxCapture(sessionName: string): string {
  const result = Bun.spawnSync(['tmux', 'capture-pane', '-p', '-e', '-J', '-t', sessionName])
  if (result.exitCode !== 0) {
    return `[ERROR] tmux capture-pane failed: ${result.stderr.toString().trim()}`
  }
  return result.stdout.toString()
}

async function main() {
  let input: ToolInput

  if (process.argv.length > 2) {
    const action = process.argv[2] as ToolInput['action']
    input = {
      action,
      sessionName: process.argv[3],
      teamId: process.argv[3],
      tail: process.argv[4] ? parseInt(process.argv[4]) : undefined,
    }
  } else {
    const stdin = await Bun.stdin.text()
    input = JSON.parse(stdin)
  }

  let result: any

  switch (input.action) {
    case 'list': {
      const files = listFiles()
      result = { ok: true, files, outputDir: CC_OUTPUT_DIR }
      break
    }

    case 'read': {
      if (!input.sessionName) {
        result = { ok: false, error: 'sessionName is required' }
        break
      }
      const { content, lineCount } = readFile(input.sessionName, input.tail)
      result = { ok: true, sessionName: input.sessionName, lineCount, tailLines: input.tail, content }
      break
    }

    case 'read-team': {
      const prefix = (input.teamId || '').slice(0, 8)
      if (!prefix) {
        result = { ok: false, error: 'teamId is required' }
        break
      }
      const files = listFiles().filter(f => f.sessionName.startsWith(prefix))
      const outputs: Record<string, { lineCount: number; tail: string }> = {}
      for (const f of files) {
        const { content, lineCount } = readFile(f.sessionName, 30)
        outputs[f.sessionName] = { lineCount, tail: content }
      }
      result = { ok: true, teamIdPrefix: prefix, ccCount: files.length, outputs }
      break
    }

    case 'snapshot': {
      if (!input.sessionName) {
        result = { ok: false, error: 'sessionName is required' }
        break
      }
      const snapshot = tmuxCapture(input.sessionName)
      result = { ok: true, sessionName: input.sessionName, snapshot }
      break
    }

    default:
      result = { ok: false, error: `Unknown action: ${input.action}`, validActions: ['list', 'read', 'read-team', 'snapshot'] }
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, error: err.message }))
  process.exit(1)
})
