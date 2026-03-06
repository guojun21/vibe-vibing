# [41ac58c] docs: restructure devLog into commits/ and modules/ with index

**Date:** 2026-03-06

## Summary

将扁平的 devLog/ 目录重构为结构化的双层体系：按 commit 的开发变更日志 + 按模块的架构文档，并添加索引 README。

## Changes

### 目录结构变更

- `devLog/*.md`（9 个文件）→ `devLog/commits/` 原样迁入
- `devLog/modules/`（9 个新文件）— 新编写的模块架构文档
- `devLog/README.md` — 总索引，两张表格分别链接到 commits 和 modules

### 新增模块文档 (`modules/`)

| 编号 | 模块 | 内容概要 |
|------|------|----------|
| 01 | 架构总览 | 系统定位、技术栈 (React+Bun+tmux)、核心数据流、目录结构 |
| 02 | CC Instance Manager | CC 生命周期管理、状态检测算法（6 级优先级）、pipe-pane 输出持久化 |
| 03 | DA Agent Loop | LLM Plan-Execute 循环、5 个工具定义、系统提示词设计、Thalamus 客户端 |
| 04 | Team 生命周期 | Team CRUD、启停流程（逐个 CC → 等 ready → DA loop）、错误回滚 |
| 05 | Session 发现 | tmux session 自发现、日志匹配引擎、孤儿重匹配、团队关联 hydration |
| 06 | Terminal Proxy | 3 种代理类型（PTY/SSH/PipePane）、抽象基类、grouped session 切换 |
| 07 | 前端 UI | React 组件层次、Zustand 4 个 store、WebSocket 消息类型清单 |
| 08 | 日志系统 | Pino 结构化日志规范、全部事件名按模块分类索引 |
| 09 | 数据库持久化 | MongoDB + 本地文件双存储策略、健康检查端点 |

## Motivation

原先所有日志扁平堆放，commit 记录和架构说明混在一起，不利于快速查阅。拆分后：
- 想了解"某次改了什么" → 去 `commits/`
- 想了解"某个模块怎么工作" → 去 `modules/`

## Stats

```
19 files changed, 635 insertions(+)
9 renamed (devLog/ → devLog/commits/)
10 created (README.md + 9 module docs)
```
