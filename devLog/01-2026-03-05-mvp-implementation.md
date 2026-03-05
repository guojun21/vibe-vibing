# [5bc4b89] feat: MVP implementation — DA + multi CC split-view with passthrough

**Date:** 2026-03-05

## Summary

首个可运行版本。Go 后端 + Web 前端（fork agentboard），实现 DA 面板 + 多 CC 终端分屏布局。

## Changes

### Backend (Go)

- `backend/main.go` — 入口，启动 tmux 管理和 WebSocket 服务
- `backend/tmux/` — tmux 会话管理（创建/销毁/发送命令）和 pipe-pane 输出捕获
- `backend/cc/` — CC 实例生命周期管理 + 状态检测（idle/processing/permission-prompt 等）
- `backend/da/` — DA agent 基础框架
- `backend/ws/` — WebSocket server，处理前端通信
- `backend/tui/` — TUI 键盘/视图模型（BubbleTea）

### Frontend (agentboard fork)

- `agentboard/` — 完整 React+Vite 前端，含 70+ 组件和测试文件
- 分屏布局：左侧 DA 面板 + 右侧多个 CC 终端面板
- xterm.js 实时终端渲染 + 可拖拽调整大小
- DA passthrough：用户输入转发到所有 pinned CC 实例
- 每个终端实例独立 WebSocket 连接
- PWA 支持、iOS 适配、主题切换

## Stats

```
90+ files changed, massive initial commit
```
