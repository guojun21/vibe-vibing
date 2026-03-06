# Terminal Proxy 终端代理

**文件**: `server/src/terminal/` 目录

## 职责

将浏览器中的 xterm.js 终端通过 WebSocket 双向连接到后端 tmux pane，实现实时终端交互。

## 架构

```
浏览器 xterm.js
  ↕ WebSocket (binary frames)
Terminal Proxy (后端)
  ↕ tmux attach-session / send-keys
tmux pane (CC / shell)
```

## 代理类型

| 代理 | 文件 | 说明 |
|------|------|------|
| PTY Proxy | `pty-based-terminal-proxy.ts` | 本地 tmux，spawn `tmux attach` 子进程 |
| SSH Proxy | `ssh-remote-terminal-proxy.ts` | 远程主机，通过 SSH 连接远程 tmux |
| Pipe Pane | `tmux-pipe-pane-terminal-proxy.ts` | 只读模式，通过 pipe-pane 捕获输出 |

## 抽象基类 (`abstract-terminal-proxy-base.ts`)

所有代理继承自 `AbstractTerminalProxy`，提供：
- WebSocket ↔ PTY 数据转发
- 窗口大小同步 (resize)
- 会话切换 (switch target)
- 自动重连 / 错误恢复
- 鼠标模式同步

## Session 切换

用户在前端点击不同 session 时，不会断开 WebSocket 重连。而是：

```
grouped-session-target-resolver.ts
  → 根据目标 session 找到对应的 tmux window
  → tmux select-window 切换到目标窗口
  → capture-pane 抓取新窗口内容发送到前端
  → 后续输入/输出自动路由到新目标
```

## tmux 配置

所有 tmux 会话统一设置：
- `status off` — 隐藏状态栏（避免 Web UI 中干扰）
- `prefix None` / `prefix2 None` — 禁用前缀键（避免快捷键冲突）
