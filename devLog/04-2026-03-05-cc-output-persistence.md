# [96835bd] feat: CC TUI output persistence via tmux pipe-pane + agent read tools

**Date:** 2026-03-05

## Summary

通过 tmux `pipe-pane` 将 CC 终端输出持久化到文件，并提供 CLI 和 agent 工具读取。

## Changes

### Backend

- `server/src/cc-instance-manager.ts` — `startCCInstance` 中 attach `pipe-pane`，输出流写入 `~/.vibe-vibing/cc-outputs/{session}.txt`
- `CCInstance` 接口新增 `outputFilePath` 字段
- `server/src/websocket-server-entry-point.ts` — `team-status` 广播包含 `ccOutputFiles`

### Tools — New

- `tools/read-cc-output.ts` — CLI 工具：列出/读取/tail CC 输出文件
- `tools/agent-tool-read-team-cc.ts` — JSON agent 工具：list/read/read-team/snapshot

## Stats

```
4 files changed, 284 insertions(+), 4 deletions(-)
```
