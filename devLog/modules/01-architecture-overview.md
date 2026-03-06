# 架构总览

## 系统定位

Vibe Curlaude (Agentboard) 是一个 **AI Agent 编排平台**，通过 Web UI 管理多个 Claude Code CLI 实例。核心理念是"委托"——Delegate Agent (DA) 作为项目经理，通过 tmux 控制多个 Claude Code (CC) 工人实例完成开发任务。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + Vite + Tailwind CSS + Zustand |
| 后端 | Bun + Hono (WebSocket Server) |
| 终端 | tmux + xterm.js |
| LLM | Thalamus 代理 → Claude API |
| 存储 | MongoDB（可选）+ 本地 JSON 文件回退 |
| 日志 | Pino (结构化 JSON) |

## 核心数据流

```
用户 (浏览器)
  ↕ WebSocket
后端 (Bun)
  ├── Team 管理：创建/启动/停止 Team
  ├── DA Agent Loop：LLM 驱动的 Plan-Execute 循环
  │     ├── Thalamus Client → Claude API
  │     └── Tool Executor → CC 实例操作
  ├── CC Instance Manager：tmux 会话生命周期
  ├── Session 管理：session 发现 + 日志匹配
  └── Terminal Proxy：WebSocket ↔ tmux pane 双向流
```

## 目录结构

```
├── frontend/
│   ├── src/
│   │   ├── components/       # React UI 组件
│   │   ├── stores/           # Zustand 状态管理
│   │   └── utils/            # 工具函数
│   └── index.html
├── server/
│   ├── src/
│   │   ├── database/         # 持久化层
│   │   ├── terminal/         # 终端代理
│   │   ├── shared/           # 前后端共享类型
│   │   └── *.ts              # 核心模块
│   └── package.json
├── devLog/
│   ├── commits/              # 按 commit 的开发日志
│   └── modules/              # 模块架构文档
└── tools/                    # CLI 工具
```

## 关键概念

| 概念 | 说明 |
|------|------|
| **Team** | 一组 CC 实例 + 一个 DA 的逻辑分组，可创建/启动/停止 |
| **DA (Delegate Agent)** | LLM 驱动的项目经理，通过工具调用指挥 CC 实例 |
| **CC (Claude Code)** | 实际执行编码任务的 Claude Code CLI 实例，运行在 tmux 中 |
| **Session** | 一个 tmux 窗口的抽象表示，可以是 CC、DA 或普通 shell |
| **Thalamus** | 本地 LLM 代理服务，转发请求到 Claude API |
