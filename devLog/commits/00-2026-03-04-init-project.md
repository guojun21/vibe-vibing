# [57ea6ca] init: Vibe Curlaude project with design README

**Date:** 2026-03-04

## Summary

项目初始化。Delegate Agent 架构设计 —— 控制 Claude Code CLI 而非直接编码。

## Changes

- `.gitignore` — 标准 Node/Bun 忽略规则
- `README.md` — 完整架构设计文档，283 行
- `backend/.gitkeep` — 后端占位

## Details

- 架构设计：Delegate Agent 通过 tmux 控制多个 Claude Code CLI 实例
- 工具集规范：定义 DA 与 CC 之间的交互协议
- 哲学基础：为什么选择"委托"而非"直接编码"
- 对抗性评审：自我批判与风险分析

## Stats

```
3 files changed, 317 insertions(+)
```
