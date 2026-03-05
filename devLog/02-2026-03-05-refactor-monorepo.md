# [da9a6ac] refactor: migrate agentboard into frontend/ + server/ with full rename

**Date:** 2026-03-05

## Summary

将 agentboard 单体拆分为 `frontend/`（React+Vite）和 `server/`（Bun WS），全部 86 个文件重命名为 kebab-case。

## Changes

### Deleted

- `agentboard/` — 整个目录删除（1583 行 lockfile、60+ 测试文件、所有源码）

### Created

- `frontend/` — React + Vite + Tailwind 前端
  - `index.html`, `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`
  - `src/` — 所有组件从 PascalCase 重命名为 kebab-case 描述性命名
- `server/` — Bun WebSocket 后端
  - 从 agentboard server 代码迁移并重命名
- `package.json` — 统一 monorepo 依赖管理

### Key Decisions

- kebab-case 文件命名：`App.tsx` → `application-root-layout.tsx`
- 开发模式 WS 直连后端 `:4040`（绕过 Bun proxy 兼容问题）
- Tailwind CSS content paths 适配新目录结构
- 保留所有 MVP 功能

## Stats

```
86 files renamed, agentboard/ deleted
```
