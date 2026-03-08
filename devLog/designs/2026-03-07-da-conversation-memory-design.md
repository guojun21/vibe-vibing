# DA 对话记忆系统设计

> 方案 B：摘要回注 + 查询工具
> 日期：2026-03-07

## 1. 目标

让 DA 拥有跨多次对话的**持久化记忆**：

1. **感知自身**：DA 知道当前是本 Team 第几轮对话
2. **自动总结**：每 10 轮用户-DA 来回对话，后端自动生成段落摘要
3. **滑动窗口**：新对话启动时，system prompt 自动注入"摘要 + 最近完整对话"
4. **主动查询**：DA 可通过工具查更早的对话细节
5. **全量持久化**：所有对话事件存入 MongoDB
6. **重日志**：所有关键行为打结构化日志

## 2. 数据模型

### 2.1 MongoDB 集合

#### `da_transcripts` — 对话事件流

每个 document = DA agent loop 的一个事件。

```typescript
interface DATranscriptEvent {
  _id?: ObjectId
  teamId: string
  loopId: string          // 本次 runAgentLoop 的 UUID
  roundNumber: number     // 本 Team 第几轮对话（从 1 开始，跨 loopId 递增）
  step: number            // loop 内第几步（0-based）
  type: 'user_input' | 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error'
  content?: string        // thinking/complete/error 的文本
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
  }>
  toolResults?: Array<{
    id: string
    name: string
    output: string
    isError: boolean
  }>
  timestamp: Date
}
```

索引：
- `{ teamId: 1, roundNumber: 1, step: 1 }`（按 Team + 轮次查询）
- `{ teamId: 1, timestamp: -1 }`（按时间倒序）
- `{ loopId: 1, step: 1 }`（查单次 loop）

#### `da_conversation_summaries` — 段落摘要

每个 document = 一个段落（10 轮对话）的 LLM 生成摘要。

```typescript
interface DAConversationSummary {
  _id?: ObjectId
  teamId: string
  paragraphIndex: number  // 第几段（0-based：第 0 段 = 第 1-10 轮）
  roundStart: number      // 覆盖的起始轮次
  roundEnd: number        // 覆盖的结束轮次
  summary: string         // LLM 生成的摘要文本
  generatedAt: Date
  generatorModel: string  // 生成摘要时使用的模型
  inputTokenEstimate: number  // 输入 token 估算（用于监控）
}
```

索引：
- `{ teamId: 1, paragraphIndex: 1 }`（unique）
- `{ teamId: 1, roundStart: 1 }`

#### `da_round_counters` — 轮次计数器

每个 Team 一条记录，追踪当前轮次。

```typescript
interface DARoundCounter {
  _id?: ObjectId
  teamId: string          // unique
  currentRound: number    // 当前最新轮次号
  updatedAt: Date
}
```

### 2.2 内存回退

MongoDB 不可用时，使用内存 Map（和现有 repository 一致）：
- `Map<string, DATranscriptEvent[]>` — key 是 teamId
- `Map<string, DAConversationSummary[]>` — key 是 teamId
- `Map<string, number>` — key 是 teamId，value 是 currentRound

## 3. 核心流程

### 3.1 对话持久化流程

```
用户发送消息 → handleDAInputMessage (websocket-server-entry-point.ts)
  │
  ├── 1. incrementRound(teamId) → 获取本轮 roundNumber
  │     日志: da_round_incremented { teamId, roundNumber }
  │
  ├── 2. appendTranscript({ type: 'user_input', content, roundNumber, step: 0 })
  │     日志: da_transcript_persisted { teamId, roundNumber, type: 'user_input' }
  │
  ├── 3. 构建 system prompt（注入历史，见 3.3）
  │     日志: da_context_assembled { teamId, roundNumber, summaryCount, recentRoundsCount, totalTokenEstimate }
  │
  ├── 4. runAgentLoop 开始
  │     每个回调点持久化:
  │       onThinking  → appendTranscript({ type: 'thinking', ... })
  │       onToolCall  → appendTranscript({ type: 'tool_call', ... })
  │       onToolResult→ appendTranscript({ type: 'tool_result', ... })
  │       onComplete  → appendTranscript({ type: 'complete', ... })
  │       onError     → appendTranscript({ type: 'error', ... })
  │     每次日志: da_transcript_persisted { teamId, roundNumber, type, step }
  │
  └── 5. loop 结束后检查是否需要生成摘要（见 3.2）
```

### 3.2 自动摘要生成

```
roundNumber % 10 === 0 时触发:
  │
  ├── 1. 从 da_transcripts 查出 roundStart..roundEnd 的所有事件
  │     日志: da_summary_generation_start { teamId, paragraphIndex, roundStart, roundEnd, eventCount }
  │
  ├── 2. 组装摘要 prompt，发送到 Thalamus
  │     System: "你是一个对话摘要助手。请总结以下 DA agent 的对话记录..."
  │     User: [序列化的对话事件]
  │     日志: da_summary_llm_request { teamId, paragraphIndex, inputTokens }
  │
  ├── 3. 存入 da_conversation_summaries
  │     日志: da_summary_generated { teamId, paragraphIndex, summaryLength, latencyMs }
  │
  └── 4. 失败时:
        日志: da_summary_generation_error { teamId, paragraphIndex, error }
        (不影响主流程，摘要生成失败不阻塞对话)
```

摘要 prompt 模板：

```
请将以下 DA agent 的第 {roundStart}-{roundEnd} 轮对话总结为一段简要摘要（200-400字）。
重点记录：
1. 用户请求了什么
2. DA 分派了哪些任务给哪些 CC
3. 结果如何（成功/失败/部分完成）
4. 遗留问题或待办事项

对话记录：
{serialized events}
```

### 3.3 上下文注入（滑动窗口 + 摘要）

每次 `runAgentLoop` 启动时，`buildDASystemPrompt` 自动注入历史：

```
┌─────────────────────────────────────────────────┐
│ [原有 system prompt]                              │
│                                                   │
│ ## 对话历史                                       │
│                                                   │
│ 你是本 Team 的第 {roundNumber} 轮对话。             │
│                                                   │
│ ### 早期摘要                                      │
│ [段落摘要 #0] 第 1-10 轮: "用户要求搭建项目..."      │
│ [段落摘要 #1] 第 11-20 轮: "重构了 auth 模块..."    │
│                                                   │
│ ### 最近对话（最近 10 轮完整记录）                   │
│ [Round 21] User: "现在处理数据库迁移"               │
│ [Round 21] DA: "Plan: ... → agent-1, ... → agent-2"│
│ [Round 21] Tool: send_to_cc(agent-1, ...)          │
│ [Round 21] Result: ...                             │
│ [Round 22] User: "检查一下结果"                     │
│ ...                                                │
└─────────────────────────────────────────────────┘
```

**滑动窗口规则**：
- 最近 10 轮：注入完整的 user_input + complete/error（不含中间 thinking/tool 细节，避免 token 爆炸）
- 10 轮以前：只注入段落摘要
- 如果最近 10 轮超过 4000 tokens，截断到最近 5 轮 + 更多摘要

日志：
```
da_context_assembled {
  teamId, roundNumber,
  summaryCount,           // 注入了几段摘要
  recentRoundsCount,      // 注入了几轮完整对话
  recentRoundsTokens,     // 最近对话的 token 估算
  summaryTokens,          // 摘要的 token 估算
  totalContextTokens      // 总计
}
```

### 3.4 DA 查询工具

新增工具 `query_conversation_history`：

```typescript
{
  name: 'query_conversation_history',
  description: 'Query earlier conversation history for this team. ' +
    'Use this when you need details from conversations older than ' +
    'what is in your context window.',
  parameters: {
    type: 'object',
    properties: {
      round_start: {
        type: 'number',
        description: 'Start round number (inclusive)'
      },
      round_end: {
        type: 'number',
        description: 'End round number (inclusive)'
      },
      keyword: {
        type: 'string',
        description: 'Optional keyword to filter results'
      },
      include_tool_details: {
        type: 'boolean',
        description: 'Include tool_call/tool_result details. Default false (only user_input + complete).'
      }
    },
    required: ['round_start', 'round_end']
  }
}
```

执行逻辑：
1. 从 `da_transcripts` 查指定范围的事件
2. 如果 `include_tool_details` 为 false，只返回 `user_input` 和 `complete` 类型
3. 如果有 `keyword`，对 content 做模糊匹配过滤
4. 结果格式化为文本返回

日志：
```
da_history_query {
  teamId, roundStart, roundEnd, keyword,
  includeToolDetails, resultCount, latencyMs
}
```

## 4. 文件变更清单

### 新增文件

| 文件 | 职责 |
|------|------|
| `server/src/database/da-transcript-repository.ts` | 对话事件 CRUD + 轮次计数器 |
| `server/src/da-conversation-summary.ts` | 自动摘要生成逻辑 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `server/src/da-agent-loop.ts` | 每个回调点调用 `appendTranscript()`；loop 结束后触发摘要检查 |
| `server/src/da-system-prompt.ts` | `buildDASystemPrompt()` 增加 `conversationHistory` 参数，注入摘要 + 最近对话 |
| `server/src/da-tool-definitions.ts` | 新增 `query_conversation_history` 工具定义 |
| `server/src/da-tool-executor.ts` | 新增 `execQueryConversationHistory()` 执行函数 |
| `server/src/database/mongodb-connection.ts` | `ensureIndexes()` 添加 3 个新集合的索引 |
| `server/src/websocket-server-entry-point.ts` | DA input handler 中调用 `incrementRound()` + 传 roundNumber 给 loop |

## 5. 日志事件索引

| 事件名 | 级别 | 触发点 | 关键字段 |
|--------|------|--------|----------|
| `da_round_incremented` | info | 用户发消息时 | teamId, roundNumber |
| `da_transcript_persisted` | info | 每次 appendTranscript | teamId, roundNumber, type, step, loopId |
| `da_transcript_persist_error` | error | appendTranscript 失败 | teamId, error |
| `da_context_assembled` | info | buildDASystemPrompt | teamId, roundNumber, summaryCount, recentRoundsCount, totalContextTokens |
| `da_summary_generation_start` | info | 摘要触发时 | teamId, paragraphIndex, roundStart, roundEnd, eventCount |
| `da_summary_llm_request` | info | 调 Thalamus 前 | teamId, paragraphIndex, inputTokenEstimate |
| `da_summary_generated` | info | 摘要存入 Mongo | teamId, paragraphIndex, summaryLength, latencyMs |
| `da_summary_generation_error` | error | 摘要生成失败 | teamId, paragraphIndex, error |
| `da_history_query` | info | DA 调查询工具 | teamId, roundStart, roundEnd, keyword, resultCount, latencyMs |
| `da_history_query_error` | error | 查询失败 | teamId, error |

## 6. 设计决策

| 决策 | 理由 |
|------|------|
| 用 MongoDB 而非 JSONL | 项目已有 MongoDB 基础设施，支持结构化查询 |
| 后端自动生成摘要（非 DA 自己生成） | 保证一致性，不依赖 DA 的"自觉" |
| 最近 10 轮只注入 user_input + complete | 中间 thinking/tool 细节 token 太多，完整注入会爆 |
| 摘要生成失败不阻塞对话 | 摘要是增强能力，不是核心功能 |
| 内存回退兜底 | 保持和现有 repository 一致的容错模式 |
| 段落大小 10 轮 | 太小摘要太碎，太大摘要不及时；10 轮约 1 个工作阶段 |
