# 11 — CC 终端颜色渲染 + 鼠标滚轮 + DA 循环防重复

- **日期**: 2026-03-07
- **类型**: fix / feat
- **分支**: main

## 背景

CC (Claude Code) 在 Web 端 xterm.js 中显示为纯黑白，没有任何颜色，且鼠标滚轮无法滚动历史。同时 DA Agent Loop 存在重复调用同一工具的死循环问题。

## 根因分析

### 颜色问题

tmux 全局环境变量 `TERM=dumb`（服务器进程从非 TTY 环境启动导致），Claude Code 的 Ink/chalk 渲染引擎检测到 `TERM=dumb` 后认为终端不支持颜色，完全不输出 ANSI 颜色转义序列。

验证方法：`tmux capture-pane -e` 的输出用 `xxd` 检查，确认零 ANSI SGR 序列（`\x1b[38;2;...m`）。

参考：`reference/01-multi-agent-orchestration/claude-squad/ui/overlay/overlay.go` 中的 ANSI 正则处理证实 CC 正常情况下会输出 truecolor ANSI 码。

### 滚轮问题

前端 xterm.js 已实现 SGR mouse wheel 事件转发（`use-terminal-xterm-session.ts` 第 670-707 行），但 tmux session 未开启 `mouse on`，导致 mouse 事件被丢弃。

### PTY 模式历史覆盖

PTY 模式下，`captureTmuxHistory`（`tmux capture-pane`）获取的无色纯文本被先写入 xterm.js，覆盖了后续 PTY 流中 tmux `refresh-client` 发来的带颜色渲染。

## 变更文件

### `server/src/cc-instance-manager.ts`

- `ensureTmuxServer()`: 设置全局 tmux 环境 `TERM=xterm-256color`、`FORCE_COLOR=1`、`COLORTERM=truecolor`、`default-terminal=xterm-256color`
- `createTmuxSession()`: shell 命令中在 `.zshrc` 之后 export `TERM=xterm-256color COLORTERM=truecolor FORCE_COLOR=3`；新增 `default-terminal xterm-256color` 和 `mouse on` 选项

### `server/src/websocket-server-entry-point.ts`

- `attachTerminalPersistent()`: PTY 模式下跳过 `captureTmuxHistory`，让 tmux PTY 流直接提供带颜色的屏幕内容
- `captureTmuxHistory()`: 添加 `-e` flag 保留 ANSI 转义序列（pipe-pane 模式 fallback）
- `captureTmuxHistoryRemote()`: 同上

### `frontend/src/hooks/use-terminal-xterm-session.ts`

- `cursorBlink: true`、`cursorStyle: 'bar'`、`cursorInactiveStyle: 'bar'`（光标始终可见）
- `minimumContrastRatio: 1`（不干扰 truecolor 渲染）

### `server/src/da-agent-loop.ts`

- 新增工具调用重复检测：连续 3 次相同 tool call pattern 后注入系统消息要求停止
- `forceStopIssued` 机制：警告后下一轮传空工具列表，强制模型输出文本总结
- 日志增强：`samePatternCount`、`da_agent_loop_repetition_detected`、`da_agent_loop_force_stopped`

## 环境变量说明

| 变量 | 值 | 作用 |
|------|-----|------|
| `TERM` | `xterm-256color` | 告诉终端支持 256 色 |
| `COLORTERM` | `truecolor` | 告诉应用支持 24-bit RGB |
| `FORCE_COLOR` | `3` | 强制 chalk/Ink 输出 truecolor 级别 ANSI |

## 验证

- `tmux capture-pane -e` 输出包含 `\x1b[38;2;R;G;Bm` truecolor 序列
- 浏览器 xterm.js 中 CC 显示蓝色路径、绿色 bullet、黄色高亮等颜色
- 鼠标滚轮可触发 tmux copy-mode 滚动历史
