# 日志系统

**文件**: `server/src/structured-pino-logger.ts`

## 实现

基于 **Pino** 的结构化 JSON 日志，统一导出为全局 `logger` 单例。

```typescript
import { logger } from './structured-pino-logger'

logger.info({ event: 'team_started', teamId, latencyMs: 42 }, 'team_started')
logger.error({ event: 'cc_start_error', error: errMsg }, 'cc_start_error')
```

## 日志级别

| 级别 | 用途 |
|------|------|
| `debug` | 详细调试信息（WS 消息、pane 内容哈希） |
| `info` | 正常运行事件（启动、停止、状态变更） |
| `warn` | 警告（超时、重试、回退） |
| `error` | 错误（启动失败、连接断开） |

## 结构化字段约定

所有日志条目遵循统一格式 `logger.level({ data }, 'event_name')`：

| 字段 | 说明 |
|------|------|
| `event` | 事件名（snake_case），如 `team_started` |
| `reqId` | 请求 ID（WS handler 内） |
| `teamId` | 关联的 Team |
| `latencyMs` | 操作耗时 |
| `error` | 错误消息 |
| `stack` | 错误堆栈 |

## HTTP 请求日志

Hono 中间件自动记录每个 HTTP 请求：

```
→ http_request  { method, path, reqId }
← http_response { method, path, status, latencyMs }
```

## 核心事件名索引

### 🔧 Team 生命周期
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `team_start_begin` | info | 开始启动 Team |
| `team_started` | info | Team 启动完成 |
| `team_start_error` | error | Team 启动失败 |
| `team_stopped` | info | Team 停止 |
| `team_created` | info | 新 Team 创建 |
| `team_deleted` | info | Team 删除 |

### 🤖 CC 实例
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `cc_starting` | info | 开始启动 CC 实例 |
| `cc_started` | info | CC 实例启动成功 |
| `cc_start_error` | error | CC 启动失败 |
| `cc_stopped` | info | CC 实例停止 |
| `cc_status_changed` | debug | CC 状态变化 |
| `cc_wait_ready_poll` | info | 等待 CC ready 轮询中 |
| `cc_wait_ready_timeout` | error | 等待 CC ready 超时 |

### 🧠 DA Agent Loop
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `da_loop_start` | info | DA 循环开始 |
| `da_loop_step` | info | DA 每步迭代 |
| `da_loop_complete` | info | DA 循环正常结束 |
| `da_loop_error` | error | DA 循环异常 |
| `da_tool_call` | info | DA 调用工具 |
| `da_tool_result` | info | DA 工具返回结果 |
| `wait_for_idle_poll` | info | 等待 CC idle 轮询 |
| `wait_for_idle_resolved` | info | CC 变为 idle |
| `wait_for_idle_timeout` | warn | 等待 idle 超时 |

### 📡 WebSocket
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `ws_connected` | info | 客户端连接 |
| `ws_disconnected` | info | 客户端断开 |
| `ws_message` | debug | 收到消息 |
| `ws_broadcast` | debug | 广播消息 |

### 💾 数据库
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `mongodb_connected` | info | MongoDB 连接成功 |
| `mongodb_fallback` | warn | 回退到内存存储 |
| `session_persisted` | debug | Session 持久化 |

### 🔍 Session 发现
| 事件 | 级别 | 触发点 |
|------|------|--------|
| `sessions_refreshed` | debug | Session 列表刷新 |
| `session_discovered` | info | 发现新 Session |
| `log_matched` | info | 日志匹配到 Session |
| `orphan_rematch` | info | 孤儿 Session 重匹配 |
