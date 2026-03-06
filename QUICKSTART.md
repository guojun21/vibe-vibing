# Quick Start

5 分钟跑起来 Vibe Curlaude。

## 前提条件

| 工具 | 最低版本 | 安装 |
|------|----------|------|
| **Bun** | 1.3.6+ | `curl -fsSL https://bun.sh/install \| bash` |
| **tmux** | 3.2+ | macOS: `brew install tmux` |
| **Claude Code CLI** | 2.x | `npm install -g @anthropic-ai/claude-code`（需 Node 18+） |
| **Node.js** | 18+ | Claude CLI 运行需要；如果系统默认 <18，用 `nvm install 22` |

可选：
- **MongoDB** — 不装也能跑，teams 会持久化到本地 JSON 文件 (`server/data/teams.json`)
- **Thalamus** — DA 的 LLM 代理。不配置则 DA agent loop 无法调用模型

## 1. 克隆 & 安装

```bash
git clone https://github.com/guojun21/vibe-vibing.git
cd vibe-vibing
bun install
```

## 2. 启动

```bash
bun run dev
```

这会同时启动：
- **后端** Bun WebSocket server → `http://localhost:4040`
- **前端** Vite dev server → `http://localhost:5173`

打开浏览器访问 `http://localhost:5173`。

## 3. 创建第一个 Team

1. 左上角点 **+** 按钮
2. 填写 Team 名称（如 `my-project`）
3. 填写 Project 路径（CC 的工作目录，如 `/path/to/your/project`）
4. 成员默认 1 个 Claude CC，可以点 "Add team member" 增加
5. 点 **Create team**

## 4. 启动 Team

点 sidebar 里的 **Start** 按钮。后端会：
- 创建 tmux session
- 在 tmux 里启动 `claude` CLI
- 等待 CC 就绪（约 5-15 秒）

就绪后你会看到：
- 左侧 sidebar 显示 **Running** 绿色标记和 `agent-1: idle`
- 右侧自动出现该 team 的 CC 终端（Claude Code TUI 界面）

## 5. 与 DA 对话

在中间的 DA 面板输入指令，如：

```
检查当前项目结构并列出所有源文件
```

DA 会：
1. 调用 `get_all_cc_status` 检查 CC 状态
2. 制定计划
3. 通过 `send_to_cc` 把任务派发给 CC
4. 用 `wait_for_idle` 等待 CC 完成
5. 用 `read_cc_output` 读取结果
6. 汇报给你

## 环境变量

在项目根目录创建 `.env`（可选）：

```bash
# DA 使用的 LLM 代理（默认 localhost:3013）
THALAMUS_URL=http://localhost:3013
THALAMUS_MODEL=grok-code-fast-1

# MongoDB（不设则用本地 JSON 文件）
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=vibe_vibing
```

## 常用命令

```bash
bun run dev          # 开发模式（前后端同时启动，热重载）
bun run build        # 构建前端
bun run start        # 生产模式启动后端
bun run typecheck    # TypeScript 类型检查
bun run lint         # Lint 检查
```

## 项目结构

```
vibe-vibing/
├── frontend/          # React + Vite 前端
│   └── src/
│       ├── components/
│       │   ├── team-view.tsx           # Team 视图（DA + CC 整体）
│       │   ├── delegate-agent-chat-panel.tsx  # DA 对话面板
│       │   ├── team-sidebar.tsx        # Team 列表
│       │   └── terminal-instance-*.tsx # CC 终端组件
│       └── stores/
│           ├── team-state-store.ts     # Team 状态管理
│           └── session-state-store.ts  # Session 状态管理
├── server/            # Bun 后端
│   └── src/
│       ├── websocket-server-entry-point.ts  # WS 主入口
│       ├── da-agent-loop.ts           # DA Agent 循环
│       ├── thalamus-client.ts         # LLM 代理客户端
│       ├── cc-instance-manager.ts     # CC 实例管理
│       ├── team-lifecycle-service.ts  # Team 生命周期
│       └── database/
│           └── team-repository.ts     # Team 持久化
├── shared/            # 前后端共享类型
├── package.json
└── QUICKSTART.md      # ← 你在这里
```

## 排错

**CC 启动失败 / 状态一直是 unknown**
- 确认 `claude` CLI 已全局安装且在 PATH 中：`which claude`
- 确认 Node.js >= 18：`node --version`
- 如果用 nvm，确认 tmux session 里能访问到正确的 node 版本

**DA 不调用工具 / 只回复文字**
- 检查 Thalamus 是否在运行：`curl http://localhost:3013/v1/models`
- 查看后端日志中的 `thalamus_request_error`
- 尝试换更强的模型（如 `claude-4.5-sonnet`）

**Team 每次重启都丢失**
- 正常情况下 teams 会持久化到 `server/data/teams.json`
- 检查该文件是否存在且有写权限
