# [83af774] feat: unified team-session sidebar with team grouping and session hydration

**Date:** 2026-03-06

## Summary

重新设计左侧栏，将 Team 和 Session 合并为统一的层级视图。每个 Team 是可展开的分组，展开后显示属于该 Team 的 sessions；不属于任何 Team 的散装 sessions 单独列在下方。

## 设计概念

### 之前的结构

```
Left Sidebar
├── Header (AGENTBOARD + New/Settings)
├── TeamSidebar          ← 独立区域，只管 team 列表
│   ├── TEAMS header [+]
│   └── TeamItem × N
├── ─── 分隔线 ───
└── SessionList          ← 独立区域，列出所有 session
    ├── SESSIONS header + filters
    └── SessionRow × N
```

Team 和 Session 是两个平行的独立区域，没有体现关联关系。

### 现在的结构

```
Left Sidebar
├── Header (AGENTBOARD + New/Settings)
└── TeamSidebar (unified)            ← 统一容器
    ├── TEAMS header [+]
    ├── InlineTeamCreator (条件渲染)
    ├── TeamSessionGroup × N         ← 每个 team 一个可展开组
    │   ├── Team header (chevron + name + status + CC count)
    │   ├── Team actions (Start/Stop/Delete, 选中时显示)
    │   └── TeamSessionRow × N       ← 属于该 team 的 sessions
    ├── SESSIONS divider             ← 有 team 且有散装 session 时显示
    └── SessionList (embedded)       ← 散装 sessions，复用原有 DnD/动画
        └── SortableSessionItem × N
```

### 关键设计决策

1. **Team-Session 关联通过 `teamId` 字段建立**
   - `Session` 接口新增 `teamId?` 和 `teamName?` 可选字段
   - 后端在 session 刷新流程中通过 `hydrateSessionsWithTeamInfo()` 注入这些字段
   - 关联数据来源：`SessionDocument.teamId`（已持久化）+ `TeamDocument`（查 teamName）

2. **复用而非重写 SessionList**
   - `SessionList` 原组件有 ~1100 行，包含 DnD 拖拽排序、framer-motion 动画、过滤器、虚拟滚动等复杂逻辑
   - 新增 `embedded` prop：为 `true` 时不渲染 `<aside>` 外壳、header、快捷键提示
   - 散装 sessions 仍然享有完整的 DnD、动画、过滤功能

3. **Team 内部 sessions 用轻量级渲染**
   - `TeamSessionRow` 是新写的轻量组件，不依赖 DnD/动画
   - 显示：agent 图标 + session 名 + project badge + 相对时间
   - Team 内的 sessions 数量通常较少（1-5 个 CC），不需要重排序

4. **分组逻辑在 TeamSidebar 中完成**
   - `sessionsByTeam`: `Map<teamId, Session[]>`，按 teamId 分组
   - `standaloneSessions`: `teamId` 为空的 sessions
   - 两个 `useMemo` 确保只在 sessions 变化时重新计算

## 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| `TeamSidebar` | `team-sidebar.tsx` | 统一容器，管理 team CRUD 操作，分发 sessions 到各组 |
| `TeamSessionGroup` | `team-session-group.tsx` | 单个 team 的展开/收起组，含 team 操作按钮和内嵌 session 列表 |
| `TeamSessionRow` | `team-session-group.tsx` | team 内部的单条 session 渲染（轻量级） |
| `SessionList` | `session-list-sidebar.tsx` | 散装 session 列表，支持 `embedded` 模式 |
| `TeamItem` | `team-item.tsx` | 已废弃（功能合并到 `TeamSessionGroup`） |

## 数据流

```
WebSocket server
  → refreshSessionsAsync / refreshSessionsSync
    → hydrateSessionsWithAgentSessions(sessions)
    → hydrateSessionsWithTeamInfo(sessions)    ← 新增
      → getAllSessions() from session-repository
      → getAllTeams() from team-repository
      → 匹配 tmuxSessionName → { teamId, teamName }
    → broadcast sessions (含 teamId, teamName)

Frontend
  → session-state-store 接收 sessions（含 teamId, teamName）
  → sessionsEqualById 比较时包含 teamId, teamName
  → TeamSidebar 按 teamId 分组
    → TeamSessionGroup 渲染 team 内 sessions
    → SessionList(embedded) 渲染散装 sessions
```

## Changes

### Backend — Modified

- `server/src/shared/shared-message-and-session-types.ts` — `Session` 接口新增 `teamId?`, `teamName?`
- `server/src/websocket-server-entry-point.ts` — 新增 `hydrateSessionsWithTeamInfo()`，集成到两个刷新管线
- `server/src/database/session-repository.ts` — 新增 `getAllSessions()` 导出

### Frontend — New Files

- `frontend/src/components/team-session-group.tsx` — Team 分组展开组件 + 内嵌 session 行

### Frontend — Modified

- `frontend/src/components/team-sidebar.tsx` — 重写为统一侧边栏容器
- `frontend/src/components/session-list-sidebar.tsx` — 新增 `embedded` prop，提取 `renderSessionRows()` 复用
- `frontend/src/application-root-layout.tsx` — 移除 SessionList 直接引用，改为通过 TeamSidebar 传递 session props
- `frontend/src/stores/session-state-store.ts` — `sessionsEqualById` 新增 teamId, teamName 比较

## Stats

```
8 files changed, 502 insertions(+), 197 deletions(-)
```
