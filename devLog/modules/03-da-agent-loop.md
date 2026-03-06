# DA Agent Loop

**文件**: `server/src/da-agent-loop.ts`, `server/src/da-system-prompt.ts`, `server/src/da-tool-definitions.ts`, `server/src/da-tool-executor.ts`

## 职责

DA (Delegate Agent) 是 LLM 驱动的项目经理。接收用户指令后，通过 Plan-Execute 循环自主规划、分派任务到 CC 实例、验证结果、汇报。

## 循环流程

```
用户输入 → 构建 system prompt + messages
  ↓
[Step 1..30] 每步：
  1. 调用 Thalamus LLM (callThalamus)
  2. 如果返回 tool_calls → 执行工具 → 结果追加到 messages → 继续
  3. 如果返回文本 (stop) → onComplete 回调 → 结束
  ↓
上下文超过 60 条消息时自动裁剪
```

## 工具集

| 工具 | 说明 |
|------|------|
| `get_all_cc_status` | 获取所有 CC 的当前状态 |
| `send_to_cc` | 向指定 CC 发送指令 |
| `read_cc_output` | 读取 CC 最近 N 行输出 |
| `wait_for_idle` | 阻塞等待 CC 变为 idle（默认 120s 超时） |
| `broadcast` | 向所有 CC 广播同一指令 |

## System Prompt 设计

DA 被告知：
1. **必须使用工具**——每次请求至少调用 `get_all_cc_status`
2. **强制工作流**：get_status → plan → dispatch → wait → verify → iterate → report
3. **并行执行**：独立任务同时发给不同 CC
4. **错误处理**：超时后读取输出诊断；2 次失败后上报

## 工具执行器

`da-tool-executor.ts` 将 LLM 的 tool_calls 路由到对应函数：

- `send_to_cc` → `sendInputToCCInstance(cc, text)` 向 tmux 发送键入
- `wait_for_idle` → 轮询 `refreshCCInstance` 直到 idle，每 2s 一次
- `read_cc_output` → 读取 pipe-pane 输出文件的最后 N 行
- 错误前缀 `[ERROR]` 或 `[TIMEOUT]` 标记为 `isError: true`

## Thalamus 客户端

`thalamus-client.ts` 封装对本地 Thalamus 代理的 HTTP 调用：
- 端点：`http://localhost:4141/v1/chat/completions`
- 模型：`claude-4.5-haiku`（可配置）
- 超时：120s
- 兼容 OpenAI Chat Completions API
