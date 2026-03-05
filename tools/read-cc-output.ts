#!/usr/bin/env bun
/**
 * Simple agent tool: read CC output files for a team.
 *
 * Usage:
 *   bun tools/read-cc-output.ts                       # list all CC output files
 *   bun tools/read-cc-output.ts <session-name>        # read specific CC output
 *   bun tools/read-cc-output.ts <session-name> --tail  # tail last 50 lines
 *   bun tools/read-cc-output.ts <session-name> --live  # live tail (follow)
 *   bun tools/read-cc-output.ts --team <teamId>        # list CC files for a team
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const CC_OUTPUT_DIR = join(process.env.HOME || '/tmp', '.vibe-vibing', 'cc-outputs')

interface CCOutputFile {
  sessionName: string
  filePath: string
  sizeBytes: number
  lastModified: string
}

function listOutputFiles(): CCOutputFile[] {
  if (!existsSync(CC_OUTPUT_DIR)) return []
  return readdirSync(CC_OUTPUT_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const filePath = join(CC_OUTPUT_DIR, f)
      const stat = statSync(filePath)
      return {
        sessionName: basename(f, '.txt'),
        filePath,
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
}

function readOutput(sessionName: string, tail = false, lines = 50): string {
  const filePath = join(CC_OUTPUT_DIR, `${sessionName}.txt`)
  if (!existsSync(filePath)) {
    return `[ERROR] No output file found for session "${sessionName}" at ${filePath}`
  }
  const content = readFileSync(filePath, 'utf-8')
  if (!tail) return content
  const allLines = content.split('\n')
  return allLines.slice(-lines).join('\n')
}

function readOutputForTeam(teamIdPrefix: string): Record<string, string> {
  const files = listOutputFiles().filter(f => f.sessionName.startsWith(teamIdPrefix))
  const result: Record<string, string> = {}
  for (const f of files) {
    const content = readFileSync(f.filePath, 'utf-8')
    const lines = content.split('\n')
    result[f.sessionName] = lines.slice(-30).join('\n')
  }
  return result
}

const args = process.argv.slice(2)

if (args.length === 0) {
  const files = listOutputFiles()
  if (files.length === 0) {
    console.log(`No CC output files found in ${CC_OUTPUT_DIR}`)
    console.log('Start a team first to generate CC output files.')
  } else {
    console.log(`CC Output Files (${CC_OUTPUT_DIR}):\n`)
    for (const f of files) {
      const sizeKB = (f.sizeBytes / 1024).toFixed(1)
      console.log(`  ${f.sessionName.padEnd(30)} ${sizeKB.padStart(8)} KB  ${f.lastModified}`)
    }
  }
} else if (args[0] === '--team' && args[1]) {
  const teamIdPrefix = args[1].slice(0, 8)
  const outputs = readOutputForTeam(teamIdPrefix)
  if (Object.keys(outputs).length === 0) {
    console.log(`No CC outputs found for team prefix "${teamIdPrefix}"`)
  } else {
    for (const [name, content] of Object.entries(outputs)) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`CC: ${name}`)
      console.log(`${'='.repeat(60)}`)
      console.log(content)
    }
  }
} else if (args[0] === '--live' || (args[1] === '--live')) {
  const sessionName = args[0] === '--live' ? args[1] : args[0]
  const filePath = join(CC_OUTPUT_DIR, `${sessionName}.txt`)
  if (!existsSync(filePath)) {
    console.error(`[ERROR] No output file: ${filePath}`)
    process.exit(1)
  }
  console.log(`Tailing ${filePath} ...`)
  const proc = Bun.spawn(['tail', '-f', filePath], { stdout: 'inherit', stderr: 'inherit' })
  process.on('SIGINT', () => { proc.kill(); process.exit(0) })
  await proc.exited
} else {
  const sessionName = args[0]
  const tail = args.includes('--tail')
  const output = readOutput(sessionName, tail)
  console.log(output)
}
