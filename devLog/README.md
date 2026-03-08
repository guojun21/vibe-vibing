# Vibe Vibing — 开发日志

> AI Delegate Agent 编排平台的完整开发记录。从架构设计到每一次 commit，从模块拆解到需求方案。

---

## 项目简介

Vibe Vibing 是一个 AI 多 Agent 编排平台，通过 Delegate Agent (DA) 控制多个 Claude Code (CC) 实例协同工作。核心技术栈：React + Vite 前端、Bun + Hono 后端、tmux 进程管理、MongoDB 持久化、xterm.js 终端渲染。

---

## 文档导航

```
devLog/
├── README.md              ← 你在这里：总览与导航
├── STANDARDS.md           ← 文档写入规范与模板
├── commits/               ← 变更日志（按 commit）
├── modules/               ← 模块架构文档
└── designs/               ← 需求与设计文档
```

---

## 变更日志

按时间线记录每次重要 commit。[写入规范 →](STANDARDS.md)

| # | 日期 | 标题 | 类型 |
|---|------|------|------|
| [00](commits/00-2026-03-04-init-project.md) | 03-04 | 项目初始化 + 架构设计 | init |
| [01](commits/01-2026-03-05-mvp-implementation.md) | 03-05 | MVP 实现：DA + 多 CC 分屏 | feat |
| [02](commits/02-2026-03-05-refactor-monorepo.md) | 03-05 | Monorepo 重构 + kebab-case 重命名 | refactor |
| [03](commits/03-2026-03-05-team-model.md) | 03-05 | Team 模型 + MongoDB + Go→Bun 迁移 | feat |
| [04](commits/04-2026-03-05-cc-output-persistence.md) | 03-05 | CC 输出持久化 (pipe-pane) | feat |
| [05](commits/05-2026-03-05-fix-tmux-status.md) | 03-05 | 修复 tmux 状态栏干扰 | fix |
| [06](commits/06-2026-03-05-fix-splitview-overflow.md) | 03-05 | 修复 SplitView 溢出 | fix |
| [07](commits/07-2026-03-06-da-agent-loop.md) | 03-06 | DA Agent Loop + LLM 驱动执行 | feat |
| [08](commits/08-2026-03-06-infra-hardening.md) | 03-06 | 基础设施加固 + 健康检查 | chore |
| [09](commits/09-2026-03-06-restructure-devlog.md) | 03-06 | devLog 结构化重构 + 模块文档 | docs |
| [10](commits/10-2026-03-06-unified-team-session-sidebar.md) | 03-06 | 统一 Team-Session 左侧栏设计 | feat |
| [11](commits/11-2026-03-07-cc-terminal-color-and-scroll.md) | 03-07 | CC 终端颜色渲染 + 鼠标滚轮 + DA 防重复 | fix |

---

## 模块架构

系统核心模块的设计与运行机制。

| # | 模块 | 说明 |
|---|------|------|
| [01](modules/01-architecture-overview.md) | 架构总览 | 系统定位、技术栈、核心数据流、目录结构 |
| [02](modules/02-cc-instance-manager.md) | CC Instance Manager | CC 实例生命周期、状态检测、输出持久化 |
| [03](modules/03-da-agent-loop.md) | DA Agent Loop | LLM 驱动的 Plan-Execute 循环、工具集 |
| [04](modules/04-team-lifecycle.md) | Team 生命周期 | Team CRUD、启停流程、错误处理 |
| [05](modules/05-session-discovery.md) | Session 发现 | tmux session 发现、日志匹配、团队关联 |
| [06](modules/06-terminal-proxy.md) | Terminal Proxy | WebSocket ↔ tmux 终端代理、会话切换 |
| [07](modules/07-frontend-ui.md) | 前端 UI | React 组件、Zustand 状态、WebSocket 通信 |
| [08](modules/08-logging-system.md) | 日志系统 | Pino 结构化日志、事件名索引 |
| [09](modules/09-database-persistence.md) | 数据库持久化 | MongoDB / 本地文件双存储 |

---

## 设计文档

功能需求与技术方案。

| 日期 | 文档 | 状态 |
|------|------|------|
| 03-07 | [DA 对话记忆系统](designs/2026-03-07-da-conversation-memory-design.md) | implemented |

---

## 时间线

```
2026-03-04  项目启动，架构设计
2026-03-05  MVP 落地，Team 模型，CC 持久化，前端修复
2026-03-06  DA Agent Loop，基础设施加固，侧边栏重构，devLog 结构化
2026-03-07  DA 对话记忆，CC 终端颜色修复，持久化全面 MongoDB 化
```
