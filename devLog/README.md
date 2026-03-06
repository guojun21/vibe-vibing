# devLog — Vibe Curlaude 开发日志

## 目录结构

```
devLog/
├── README.md           ← 本文件，索引
├── commits/            ← 按 commit 的开发日志（变更记录）
└── modules/            ← 模块架构文档（系统介绍）
```

---

## commits/ — 开发变更日志

按时间线记录每次重要 commit 的变更内容、动机和影响。

| # | 日期 | 标题 | 类型 |
|---|------|------|------|
| [00](commits/00-2026-03-04-init-project.md) | 2026-03-04 | 项目初始化 + 架构设计 | init |
| [01](commits/01-2026-03-05-mvp-implementation.md) | 2026-03-05 | MVP 实现：DA + 多 CC 分屏 | feat |
| [02](commits/02-2026-03-05-refactor-monorepo.md) | 2026-03-05 | Monorepo 重构 + kebab-case 重命名 | refactor |
| [03](commits/03-2026-03-05-team-model.md) | 2026-03-05 | Team 模型 + MongoDB + Go→Bun 迁移 | feat |
| [04](commits/04-2026-03-05-cc-output-persistence.md) | 2026-03-05 | CC 输出持久化 (pipe-pane) | feat |
| [05](commits/05-2026-03-05-fix-tmux-status.md) | 2026-03-05 | 修复 tmux 状态栏干扰 | fix |
| [06](commits/06-2026-03-05-fix-splitview-overflow.md) | 2026-03-05 | 修复 SplitView 溢出 | fix |
| [07](commits/07-2026-03-06-da-agent-loop.md) | 2026-03-06 | DA Agent Loop + LLM 驱动执行 | feat |
| [08](commits/08-2026-03-06-infra-hardening.md) | 2026-03-06 | 基础设施加固 + 健康检查 | chore |
| [09](commits/09-2026-03-06-restructure-devlog.md) | 2026-03-06 | devLog 结构化重构 + 模块文档 | docs |

---

## modules/ — 模块架构文档

系统各核心模块的设计、接口和运行机制说明。

| # | 模块 | 说明 |
|---|------|------|
| [01](modules/01-architecture-overview.md) | 架构总览 | 系统定位、技术栈、核心数据流、目录结构 |
| [02](modules/02-cc-instance-manager.md) | CC Instance Manager | CC 实例生命周期、状态检测算法、输出持久化 |
| [03](modules/03-da-agent-loop.md) | DA Agent Loop | LLM 驱动的 Plan-Execute 循环、工具集、系统提示词 |
| [04](modules/04-team-lifecycle.md) | Team 生命周期 | Team CRUD、启停流程、错误处理 |
| [05](modules/05-session-discovery.md) | Session 发现 | tmux session 发现、日志匹配、团队关联 hydration |
| [06](modules/06-terminal-proxy.md) | Terminal Proxy | WebSocket ↔ tmux 终端代理、会话切换 |
| [07](modules/07-frontend-ui.md) | 前端 UI | React 组件层次、Zustand 状态管理、WebSocket 通信 |
| [08](modules/08-logging-system.md) | 日志系统 | Pino 结构化日志、事件名索引 |
| [09](modules/09-database-persistence.md) | 数据库持久化 | MongoDB / 本地文件双存储、健康检查 |
