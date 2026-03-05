# [a26d167] fix: prevent SplitView content from overflowing viewport

**Date:** 2026-03-05

## Summary

修复 SplitView 中 xterm.js 终端将内容推到视口下方的溢出问题。

## Root Cause

Flexbox 子元素默认 `min-height: auto`，当 xterm.js 终端内容超出时，flex 容器不会约束子元素高度，导致内容溢出视口。

## Fix

为 SplitView 及其父容器的所有 flex 容器添加 `min-h-0`（即 `min-height: 0`），让 flex 容器正确约束子元素。

## Changed Files

- `frontend/src/application-root-layout.tsx` — 根布局容器
- `frontend/src/components/resizable-split-view-layout.tsx` — 分屏布局容器

## Stats

```
2 files changed, 5 insertions(+), 5 deletions(-)
```
