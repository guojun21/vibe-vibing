# [Unreleased] Infrastructure Hardening & Agent Loop Fixes

**Date:** 2026-03-06

## Summary

全面加固基础设施：CC 启动鲁棒性、Thalamus 日志增强、健康检查、前端 UI 优化。

## Changes

### Server — cc-instance-manager.ts

- tmux 会话创建时加载 `nvm use 22`，解决 `claude` CLI 找不到的问题
- `startCCInstance` 增加 1s 初始化延迟 + `pipe-pane` 失败后 2s 重试
- `waitCCReady` 增加 3s 初始等待、连续 10 次 unknown 自动重连 `pipe-pane`、超时诊断
- `refreshCCInstance` 修复 info/debug 重复日志
- 全面统一 logger API 为 `logger.info('event', { data })` 格式

### Server — thalamus-client.ts

- 默认模型改为 `claude-4.5-haiku`
- 请求日志增加 system prompt 长度、body 预览、URL、响应 status/content-type

### Server — mongodb-connection.ts

- 新增 `isMongoDBConnected()` 健康检查（ping + 2s 超时）
- 修复 logger 调用参数顺序

### Server — websocket-server-entry-point.ts

- `/api/health` 返回 `{ ok, mongo, thalamus }` 三状态
- 新增 `team-select` 消息处理（client no-op）

### Server — tmux-session-lifecycle-manager.ts

- 全局 `tmux set-option -g status off`，一次性禁用状态栏

### Frontend — application-root-layout.tsx

- DEV 模式打印所有 WS 消息
- team 创建后自动选中 + 发送 `team-select`
- 新增 `cc-status-update` 实时更新

### Frontend — delegate-agent-chat-panel.tsx

- 移除 `onSendToAll` 透传
- 无 team 时显示引导文案
- "Thinking..." 指示器 + 运行时禁用输入

### Frontend — team-item.tsx

- "Running" 绿色徽章 + "Archived" 标签
- Start/Stop 按钮视觉增强

### Frontend — global CSS

- xterm padding: `4px 8px`

## Stats

```
10 files changed, 193 insertions(+), 63 deletions(-)
```
