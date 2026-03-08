# devLog 写入规范

以下规范适用于新增文件。已有历史文件不做格式追溯修改。

---

## 目录与命名

| 目录 | 用途 | 文件命名 |
|------|------|----------|
| `commits/` | 每次重要 commit 的变更记录：做了什么、为什么、改了哪些文件 | `NN-YYYY-MM-DD-slug.md` |
| `modules/` | 系统核心模块的架构说明，相对稳定，随代码演进更新 | `NN-slug.md` |
| `designs/` | 功能需求、设计方案、技术选型文档 | `YYYY-MM-DD-slug.md` |

---

## 1. Commit 日志 (`commits/`)

**文件命名**: `NN-YYYY-MM-DD-slug.md`

- `NN` — 两位递增序号（从 `00` 开始），取当前目录最大序号 +1
- `YYYY-MM-DD` — commit 日期
- `slug` — 英文短横线分隔的简短描述

**模板**:

```markdown
# NN — 简短标题

- **Date**: YYYY-MM-DD
- **Type**: feat / fix / refactor / docs / chore
- **Commit**: 7 位 hash（未提交则写 Unreleased）

## Summary

一段话概述：做了什么、为什么做。

## Changes

按文件或模块列出具体变更，使用 ### 分组。

## Notes

可选。根因分析、设计权衡、参考依据、后续计划等补充内容。
```

**Type 取值**:

| Type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `refactor` | 重构（不改变行为） |
| `docs` | 文档变更 |
| `chore` | 构建、依赖、配置等工程事务 |

**注意事项**:

- Summary 必须写清"做了什么"和"为什么"，一段话即可
- Changes 按文件路径列出，每个文件一行 bullet，说明改了什么
- 如果涉及根因分析或技术决策，放在 Notes 里而不是 Summary 里
- 不需要 `## Stats` 段（需要时用 `git show --stat <hash>`）

---

## 2. 模块文档 (`modules/`)

**文件命名**: `NN-slug.md`

- `NN` — 两位序号
- `slug` — 英文短横线分隔的模块名

**模板**:

```markdown
# 模块名

## 概述

模块的职责和在系统中的位置。

## 核心接口

导出的函数、类型、配置项。

## 运行机制

内部流程、状态机、关键算法。

## 依赖关系

上下游模块、外部服务。
```

**注意事项**:

- 模块文档是"活文档"，随代码演进更新，不是一次性写完
- 侧重"为什么这样设计"而非"代码怎么写的"
- 新增模块时取当前最大序号 +1

---

## 3. 设计文档 (`designs/`)

**文件命名**: `YYYY-MM-DD-slug.md`

- 无序号前缀，按日期排序
- `slug` — 英文短横线分隔的设计主题

**模板**:

```markdown
# 设计标题

- **Date**: YYYY-MM-DD
- **Status**: draft / approved / implemented

## Background

问题背景和动机。

## Design

方案设计：数据模型、流程、接口定义。

## Implementation Notes

可选。实现过程中的补充说明、变更记录。
```

**Status 取值**:

| Status | 含义 |
|--------|------|
| `draft` | 草案，待讨论 |
| `approved` | 已确认，待实现 |
| `implemented` | 已实现落地 |

---

## 4. 通用规则

- 语言：中文为主，代码/路径/术语保持英文原文
- 文件编码：UTF-8，LF 换行
- 链接：文档间互相引用使用相对路径（如 `../modules/02-cc-instance-manager.md`）
- 新增文件后必须更新 `README.md` 的索引表格
