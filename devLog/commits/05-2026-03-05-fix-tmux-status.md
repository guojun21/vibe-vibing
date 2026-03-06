# [d581eb2] fix: disable tmux status bar and prefix key on all sessions

**Date:** 2026-03-05

## Summary

消除 Web UI 中的 tmux 状态栏和会话导航弹窗。

## Problem

tmux 默认显示底部状态栏，且 `Ctrl+B` 前缀键会触发会话导航弹窗，在 Web UI 中造成干扰。

## Fix

在 base session、grouped WS session、CC instance session 上统一设置：
- `status off` — 隐藏状态栏
- `prefix None` / `prefix2 None` — 禁用前缀键

## Changed Files

- `server/src/cc-instance-manager.ts` — CC 实例创建时设置
- `server/src/terminal/pty-based-terminal-proxy.ts` — WS 终端代理设置
- `server/src/tmux-session-lifecycle-manager.ts` — base session 设置

## Stats

```
3 files changed, 14 insertions(+), 3 deletions(-)
```
