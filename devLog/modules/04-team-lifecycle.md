# Team 生命周期

**文件**: `server/src/team-lifecycle-service.ts`, `server/src/database/team-repository.ts`

## 职责

Team 是用户管理 CC 实例的逻辑单元。一个 Team 包含 N 个 CC worker + 1 个 DA agent。Team 服务管理从创建到销毁的完整生命周期。

## 数据模型

```typescript
interface TeamDocument {
  teamId: string
  name: string
  status: 'active' | 'archived'
  config: {
    ccCount?: number
    members?: Array<{
      name: string
      agentType: 'claude-code'
      command: string
      projectPath: string
    }>
    defaultProjectPath: string
  }
  createdAt: string
  updatedAt: string
}
```

## 运行时状态

```typescript
interface TeamRuntime {
  teamId: string
  ccInstances: CCInstance[]     // 活跃的 CC 实例列表
  daSessionId: string          // DA session ID
}

interface TeamRuntimeStatus {    // 广播给前端
  teamId: string
  isRunning: boolean
  ccStatuses: Record<string, string>
  daSessionId: string | null
  ccOutputFiles: Record<string, string>
  ccSessions: Array<{ name, tmuxSessionName }>
  startup: StartupPhase | null
}
```

## 启动流程

```
startTeam(teamId)
  → 加载 TeamDocument 配置
  → 遍历 members，逐个:
      → startCCInstance()      // 创建 tmux 会话
      → waitCCReady()          // 等待 idle（120s 超时）
      → 持久化 SessionDocument
      → 广播 startup phase
  → 创建 DA session
  → 注册到 activeTeams Map
  → 启动 DA agent loop（后台）
  → 广播 team-started + team-status
```

## 停止流程

```
stopTeam(teamId)
  → 遍历 ccInstances → stopCCInstance()
  → 标记 sessions 为 stopped
  → 从 activeTeams 移除
  → 广播 team-status (isRunning: false)
```

## 持久化

- **MongoDB**：首选，通过 `team-repository.ts` 的 CRUD 操作
- **本地 JSON 回退**：MongoDB 不可用时，团队数据存入 `~/.vibe-vibing/teams.json`
- 启动时自动检测 MongoDB 连接，失败则静默回退

## 错误处理

- CC 启动失败 → 已启动的 CC 全部回滚停止 → 抛异常
- 异常被 WS handler 捕获 → 广播 `team-status { isRunning: false, startup: null }` 重置前端状态
