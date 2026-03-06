# 数据库与持久化

**文件**: `server/src/database/`, `server/src/sqlite-database-connection.ts`

## 存储策略

双存储方案 —— MongoDB 为主，本地文件为回退。

### MongoDB（可选）

| Repository | 文件 | 集合 | 存储内容 |
|------------|------|------|----------|
| Team | `team-repository.ts` | `teams` | Team 配置、成员列表、项目路径 |
| Session | `session-repository.ts` | `sessions` | Session 持久化数据、teamId 关联 |
| Message | `message-repository.ts` | `messages` | DA 对话消息历史 |

连接管理在 `mongodb-connection.ts`：
- 启动时尝试连接（带 2s 超时）
- 连接失败 → `isMongoDBConnected()` 返回 false
- Repository 层自动回退到内存 Map

### 本地文件回退

MongoDB 不可用时：
- Team 数据 → `~/.vibe-vibing/teams.json`
- Session 数据 → 内存 Map（重启后丢失）
- Message 数据 → 内存 Map

### SQLite

`sqlite-database-connection.ts` 提供额外的本地持久化选项（用于无 MongoDB 场景的进化方向）。

## 健康检查

`/api/health` 端点返回各存储的健康状态：

```json
{
  "ok": true,
  "mongo": true,       // MongoDB 可用
  "thalamus": true     // Thalamus LLM 代理可用
}
```

## Session 持久化数据模型

```typescript
interface SessionDocument {
  tmuxSessionName: string    // 主键
  displayName: string
  teamId?: string            // 所属 Team
  agentSessionId?: string
  projectPath?: string
  createdAt: string
  updatedAt: string
}
```
