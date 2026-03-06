# [f9afa72] feat: DA agent loop with LLM-driven planning, tool use, and auto-start

**Date:** 2026-03-06

## Summary

DA 从"透传器"升级为真正的 LLM 驱动 Agent。基于 Plan-Execute 模式实现 agent loop，集成 Thalamus LLM 客户端。

## Changes

### Backend — New Files

- `server/src/da-agent-loop.ts` — Agent Loop 主循环（149 行）
  - Plan-Execute 模式 + Sliding Window 上下文管理
  - 最大 20 轮迭代，支持 tool_calls 和 stop 两种结束方式
  - 通过 `AgentLoopCallbacks` 向前端推送生命周期事件
- `server/src/da-system-prompt.ts` — DA 系统提示词（52 行）
  - 定义 DA 角色、能力、工作流程
- `server/src/da-tool-definitions.ts` — MVP 工具定义（105 行）
  - `send_to_cc` — 发送命令到指定 CC 实例
  - `read_cc_output` — 读取 CC 终端最近输出
  - `get_all_cc_status` — 获取所有 CC 实例状态
  - `wait_for_idle` — 等待指定 CC 变为 idle
  - `broadcast` — 向所有 CC 广播命令
- `server/src/da-tool-executor.ts` — 工具执行器（166 行）
- `server/src/thalamus-client.ts` — Thalamus LLM API 客户端（114 行）
  - OpenAI 兼容 API，支持 tool_choice/parallel_tool_calls

### Backend — Modified

- `server/src/team-lifecycle-service.ts` — 接入 agent loop + auto-start
- `server/src/websocket-server-entry-point.ts` — 新增 `da-input`/`da-abort` 消息处理 + 113 行新增

### Frontend — Modified

- `delegate-agent-chat-panel.tsx` — 重写（213 行新增）
  - 展示 DA thinking、tool call、tool result、completion 事件
  - 移除 `onSendToAll` 透传，消息走 agent loop
- `application-root-layout.tsx` — 处理 `da-*` WS 消息（59 行新增）
- `resizable-split-view-layout.tsx` — 传递 `sendMessage` 到 DAPanel
- `team-sidebar.tsx` — 传递 `sendMessage`
- `stores/team-state-store.ts` — 新增 DA 消息/事件/运行状态管理（44 行新增）

### Shared

- `shared-message-and-session-types.ts` — 新增 DA agent 相关 WS 消息类型

## Stats

```
13 files changed, 1050 insertions(+), 47 deletions(-)
```
