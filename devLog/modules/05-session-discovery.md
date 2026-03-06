# Session 发现与日志匹配

**文件**: `server/src/tmux-session-lifecycle-manager.ts`, `server/src/periodic-log-file-poller.ts`, `server/src/log-to-session-matching-engine.ts`, `server/src/session-refresh-background-worker.ts`

## 职责

发现 tmux 中运行的所有 session，与 CC 日志文件匹配，维护前端展示的 session 列表。

## Session 来源

Session 有两种来源：

1. **Team 创建的 CC**：通过 `startCCInstance` 创建，带 `teamId`
2. **自发现的 tmux 窗口**：用户手动启动的 claude/shell 会话，通过后台轮询发现

## 发现流程

```
tmux-session-lifecycle-manager.ts
  → 列出所有 tmux 窗口
  → 过滤掉系统窗口（agentboard 自身的 WS session 等）
  → 为每个窗口创建 Session 对象
  → 检测 agent type（通过进程命令分析）

session-refresh-background-worker.ts
  → 定期刷新 session 列表
  → hydrateSessionsWithAgentSessions()  // 关联 agent session 数据
  → hydrateSessionsWithTeamInfo()       // 注入 teamId/teamName
  → 广播给所有 WebSocket 客户端
```

## 日志匹配

```
periodic-log-file-poller.ts
  → 每 60s 扫描 CC 日志目录
  → 发现新日志文件 → log-to-session-matching-engine.ts
    → 通过 tmux 窗口名 / 日志内容关键字匹配到 session
    → 更新 session 的 logFilePath、agentSessionId 等

filesystem-log-change-watcher.ts
  → 使用 fs.watch 监听日志目录变化
  → 文件变更时触发即时匹配（不等 60s 轮询）
```

## 孤儿 Session 重匹配

当 session 刷新后发现某些 session 没有匹配到日志，`orphan_rematch` 机制会：
1. 遍历所有孤儿 session
2. 通过 tmux 窗口名与已知 session 交叉匹配
3. 成功匹配的更新 displayName 和关联数据

## Session Hydration（团队关联）

```
hydrateSessionsWithTeamInfo(sessions)
  → getAllSessions() 获取所有持久化的 SessionDocument
  → getAllTeams() 获取所有 TeamDocument
  → 构建 tmuxSessionName → { teamId, teamName } 查找表
  → 为匹配的 session 注入 teamId 和 teamName
```
