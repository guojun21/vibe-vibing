# 前端 UI 架构

**文件**: `frontend/src/`

## 技术栈

- **React 19** + Vite (开发/构建)
- **Tailwind CSS** (样式)
- **Zustand** (状态管理)
- **xterm.js** (终端渲染)
- **@dnd-kit** (拖拽排序)

## 组件层次

```
application-root-layout.tsx          # 根布局 + WebSocket 连接
├── application-header-bar.tsx       # 顶部状态栏
├── team-sidebar.tsx                 # 统一侧边栏
│   ├── inline-team-creator.tsx      # 创建 Team 内联表单
│   ├── team-session-group.tsx       # Team + 下属 Session 可折叠组
│   │   └── TeamSessionRow           # Team 内的 Session 行
│   └── session-list-sidebar.tsx     # Standalone Session 列表 (embedded 模式)
│       ├── SortableSessionRow       # 可拖拽 Session 行
│       └── session-preview-modal    # 预览弹窗
├── delegate-agent-chat-panel.tsx    # DA 聊天面板
│   └── 显示 thinking / tool_call / tool_result / completion
└── resizable-split-view-layout.tsx  # CC 终端分屏
    └── xterm.js 终端实例 × N
```

## 状态管理 (Zustand Stores)

| Store | 文件 | 职责 |
|-------|------|------|
| Session Store | `session-state-store.ts` | 所有 session 的列表、排序、pin 状态 |
| Team Store | `team-state-store.ts` | team 列表、运行状态、DA 消息 |
| Settings Store | `settings-persistence-store.ts` | 用户偏好（主题、字体等） |
| Theme Store | `theme-preference-store.ts` | 暗色/亮色主题切换 |

## WebSocket 通信

根布局组件维护唯一 WebSocket 连接，处理所有消息类型：

| 消息类型 | 方向 | 说明 |
|----------|------|------|
| `sessions` | ← server | 全量 session 列表更新 |
| `session-update` | ← server | 单个 session 更新 |
| `team-status` | ← server | team 运行状态广播 |
| `da-thinking/tool_call/tool_result/completion` | ← server | DA agent loop 事件 |
| `create-team` / `start-team` / `stop-team` | → server | team 操作指令 |
| `da-input` / `da-abort` | → server | DA 用户输入/中止 |

## 侧边栏设计 (Team-Session Grouping)

侧边栏将 session 按 team 分组展示：

1. **Team 组** — 每个 Team 可折叠，展开后显示其下所有 CC session
2. **Standalone Session** — 不属于任何 team 的 session 单独列出
3. `SessionList` 组件支持 `embedded` 模式，在 Team 侧边栏内无 header 渲染
