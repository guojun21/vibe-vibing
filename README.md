# Vibe Vibing

> 左边一个 DA，右边一堆 CC。你对 DA 说话，DA 替你操控 CC。

Vibe Vibing 是一个 **tmux 原生的 AI 编程指挥台**。左侧是 Delegate Agent（DA）——你的 AI 项目经理；右侧是若干个真实的 Claude Code TUI 实例，每个跑在独立的 tmux pane 里。DA 通过 `tmux send-keys` 向 CC 发送指令，通过 `tmux capture-pane` 读取 CC 的输出，用户则在左侧面板与 DA 对话。

**CC 不是子进程，不是 API 调用，是完整的 TUI 实例。** 用户能实时看到每个 CC 面板里发生的一切——thinking、tool 调用、文件编辑——就像自己在操作一样，只不过键盘在 DA 手里。

## 核心设计理念

### DA 是操控者，CC 是真实的 TUI

右侧的每个 CC 面板都是一个真正的 `claude` TUI 进程，跑在 tmux pane 里。DA 不是通过 API 或 SDK 与 CC 交互——它通过 tmux 协议向 CC"打字"，就像一个坐在终端前的人类操作员。

这意味着：
- CC 拥有完整的 TUI 交互能力（接受/拒绝权限、`/compact`、`/clear`、Shift+Tab 切换 plan 模式）
- 用户看到的就是 CC 真实的画面，没有中间层的信息丢失
- DA 挂了，CC 还在——tmux pane 不会消失，用户可以手动接管

### CC 实例的生命周期：创建与雪藏

CC 实例**永远不会被删除**。用户可以：
- **创建**：按钮 / DA 发起 → 新建一个 tmux pane，启动 `claude` TUI
- **雪藏（归档）**：不再需要时，CC 面板从右侧隐藏，但 tmux session 保留。随时可以恢复
- **恢复**：从归档列表中拉回右侧面板

这个设计源于一个实际需求：CC 的上下文是有价值的。一个"写到一半"的 CC 实例可能过两天还需要继续，删除它就丢失了所有 context。雪藏而非删除，让每个 CC 实例都成为一个可以随时唤醒的"冻结工位"。

### DA 负责的事

| 职责 | 实现方式 |
|------|----------|
| 理解用户意图 | 与用户在左侧面板对话 |
| 了解代码上下文 | 自己 `read_file`，或派 CC 去读 |
| 制定执行计划 | `plan` 工具，展示给用户确认 |
| 操控 CC | `tmux send-keys` 发送 prompt，`tmux capture-pane` 读取输出 |
| 创建/切换 CC | `cc_new`（新建 tmux pane + `claude`），`cc_focus`（切换活跃 CC） |
| 监控 CC 状态 | 轮询 `capture-pane`，解析 TUI 状态（idle / thinking / tool_use） |
| 诊断问题 | `bash` 工具（检查网络、认证、磁盘等） |
| 汇报结果 | 在左侧面板总结 CC 的执行结果 |

用户是决策者，DA 是执行者，CC 是有独立 TUI 的工具。

## 架构

```
┌────────────────────┬─────────────────────────────────────┐
│  DA（左侧面板）     │  CC 实例（右侧面板）                 │
│                    │  ┌───────────────┬───────────────┐  │
│  User: 重构 utils  │  │  CC #1 [活跃]  │  CC #2 [空闲]  │  │
│  DA: 我先看看结构   │  │  ● thinking    │  ✓ idle       │  │
│  DA: plan 如下...  │  │  > reading     │               │  │
│  User: 确认        │  │    utils.ts    │               │  │
│  DA: 开始执行      │  │  > editing...  │               │  │
│                    │  │               │               │  │
│  [输入框]          │  │  CC #3 [归档]  ← 隐藏，可恢复   │  │
│                    │  └───────────────┴───────────────┘  │
├────────────────────┴─────────────────────────────────────┤
│ Thalamus: Connected │ CC: 2 active / 1 archived │ $0.28  │
└──────────────────────────────────────────────────────────┘
```

### tmux 拓扑

```
tmux session: vibe-vibing
├── window 0: "main"
│   ├── pane 0: DA TUI (Go/Bubbletea)
│   ├── pane 1: CC #1 (claude TUI)
│   └── pane 2: CC #2 (claude TUI)
├── window 1: "archived"
│   └── pane 0: CC #3 (claude TUI, 雪藏)
└── window 2: ...
```

DA TUI 本身跑在 pane 0，它通过 tmux 命令操控其他 pane 中的 CC 实例。右侧面板不是 DA 自己渲染的"模拟画面"——而是 tmux pane 的真实内容，DA TUI 通过 `capture-pane` 定期刷新显示。

### 技术栈

- **DA 后端**: Fork [opencode-ai/opencode](https://github.com/opencode-ai/opencode)（Go, MIT 许可）
- **DA TUI**: Bubbletea（Charm 生态）
- **DA 的 LLM 后端**: [Thalamus](../thalamus-py/)（Anthropic Messages API → Cursor API）
- **CC 实例**: 原生 `claude` TUI，每个跑在独立 tmux pane 中
- **CC 控制层**: tmux CLI（`send-keys`, `capture-pane`, `split-window`, `select-pane`）
- **前端**（计划中）: Electron + React（`./src/`, `./main/`）

### 数据流

```
用户输入
  → DA（经 Thalamus 调用 LLM 来思考）
    → DA 选择工具
      ┌─ CC 操控组 ─────────────────────────────────────┐
      │  cc_new:    tmux split-window → claude           │
      │  cc_send:   tmux send-keys -t <pane> "prompt"    │
      │  cc_read:   tmux capture-pane -t <pane> -p       │
      │  cc_focus:  切换右侧展示的活跃 CC                  │
      │  cc_archive: 将 CC pane 移至 archived window     │
      │  cc_restore: 从 archived window 恢复             │
      │  cc_key:    tmux send-keys 发送特殊按键           │
      │             (Enter, Escape, y/n, Shift+Tab...)   │
      └─────────────────────────────────────────────────┘
      ├─ bash（诊断命令）
      ├─ read_file（DA 自己读代码，不经过 CC）
      ├─ plan（展示计划给用户确认）
      └─ ask_user（向用户提问）
    → DA 根据 CC 输出决定下一步
  → 回复用户
```

## 工具集

DA 拥有 10+ 个工具，分为 4 组。

### CC 操控组

DA 通过 tmux 命令控制 CC TUI 实例。

| 工具 | tmux 底层 | 用途 |
|------|-----------|------|
| `cc_new` | `split-window` + `send-keys "claude"` | 创建新 CC 实例 |
| `cc_send` | `send-keys -t <pane>` | 向 CC 发送文本（prompt / 指令） |
| `cc_read` | `capture-pane -t <pane> -p` | 读取 CC 当前 TUI 画面 |
| `cc_focus` | 内部状态切换 | 将某个 CC 设为右侧面板焦点 |
| `cc_archive` | `move-pane` 到 archived window | 雪藏一个 CC（不销毁） |
| `cc_restore` | `move-pane` 回 main window | 从归档恢复 CC |
| `cc_key` | `send-keys` (raw keycode) | 发送特殊按键（Enter, Esc, y, n, Shift+Tab） |
| `cc_status` | `capture-pane` + 解析 | 解析 CC 的 TUI 状态（idle / thinking / tool_use / permission_prompt） |

**关键设计**：`cc_send` 不是发 API 请求，是在 tmux pane 里"打字"然后按回车。CC 看到的就是一个人类在终端里输入了一行文字。

**状态解析**：`cc_status` 通过 `capture-pane` 获取 CC 的 TUI 渲染文本，然后用正则/关键字解析当前状态：
- 末行包含 `>` → idle，等待输入
- 包含 `Thinking` spinner → thinking
- 包含 `Allow` / `Deny` → permission prompt，DA 需要决定按 y 还是 n
- 包含 `Tool:` → 正在执行 tool

### 诊断组

| 工具 | 用途 |
|------|------|
| `bash` | 通用 shell 命令，DA 自主诊断 |

### 信息获取组

| 工具 | 用途 |
|------|------|
| `read_file` | DA 直接读文件（不经过 CC，用于制定计划前理解代码） |

### 交互组

| 工具 | 用途 |
|------|------|
| `plan` | 在左侧面板展示结构化计划 |
| `ask_user` | 向用户提问并等待回答 |

## CC 实例管理

### 创建

用户点击 `[+]` 按钮或 DA 主动调用 `cc_new`。底层流程：

1. `tmux split-window -t vibe-vibing:main -h` → 新 pane
2. `tmux send-keys -t <new-pane> "claude" Enter` → 启动 CC TUI
3. 等待 CC TUI 渲染完成（轮询 `capture-pane` 直到出现 `>` prompt）
4. 注册到 DA 的 CC 实例列表

### 雪藏 / 恢复

```
雪藏: tmux move-pane -s vibe-vibing:main.<pane> -t vibe-vibing:archived
恢复: tmux move-pane -s vibe-vibing:archived.<pane> -t vibe-vibing:main
```

雪藏的 CC 进程不退出，tmux session 保持，上下文完整。用户可以在归档列表中看到所有雪藏的 CC 及其最后状态的快照。

### DA 如何多 CC 并行

DA 可以同时操控多个 CC。典型场景：

```
DA: 我把任务分成三部分
  → cc_new → CC #1: "重构 src/utils.ts"
  → cc_new → CC #2: "写 tests/utils.test.ts"
  → cc_new → CC #3: "更新 README.md"
  → 轮询三个 CC 的 cc_status，汇总进度
  → 全部完成后向用户汇报
```

## 安全机制

基于对"双层 LLM 电话游戏效应"的反思，Vibe Vibing 内置了多个工程级保障。

### 状态机门控

DA 的行为流程在 Go 代码层面硬性实现状态机：

```
Idle → Planning → Confirmed → Executing → Reviewing
```

非法的状态转移（比如跳过 plan 直接 cc_send）在代码层面被拒绝。

### Prompt 透明度

右侧面板就是 CC 的真实 TUI——DA 发给 CC 的每一条 prompt 都能在 CC 的对话历史中看到。零信息丢失，零中间层渲染。

### 熔断机制

- **Turn 上限**: 单个 CC 会话 DA 最多追加 15 轮 prompt
- **文件修改范围**: 通过 `cc_read` 监控 CC 的 tool 调用，单次会话修改超过 8 个文件时强制暂停
- **失败重试**: 同一目标尝试 2 次未达标后，强制 `ask_user`

### 分歧检测

DA 的 plan 中列出预期修改的文件和步骤，通过 `cc_read` 实时解析 CC 的 tool 调用，与预期做 diff。偏离时自动暂停并告警。

### CC 自身的安全层

CC 本身就有权限控制（文件写入需要 Allow/Deny）。在 Vibe Vibing 中，DA 需要决定是否自动批准：
- **自动批准**：DA 判断操作在 plan 范围内 → `cc_key "y"` 
- **升级到用户**：操作超出 plan 范围 → `ask_user "CC 想要删除 production.db，是否允许？"`

## Thalamus：DA 的 LLM 后端

DA 的"大脑"不是直接调 Anthropic/OpenAI API——而是通过 **Thalamus**（`thalamus-py`），一个本地跑的 FastAPI 代理服务。它把 Anthropic Messages API 翻译成 Cursor 的内部 H2/gRPC 协议，让 DA 可以免费使用 Cursor 的模型。

**已在本地运行，端口 3013。**

### Thalamus API 端点

DA 主要用到的端点：

| 方法 | 路径 | 用途 | DA 怎么用 |
|------|------|------|-----------|
| POST | `/v1/messages` | **Anthropic Messages API**（主入口） | DA 发送思考请求，支持流式 SSE |
| POST | `/v1/chat/completions` | OpenAI Chat Completions API | 备用入口 |
| GET | `/v1/models` | 可用模型列表 | DA 启动时获取模型列表 |
| GET | `/health` | 健康检查 | DA 启动时校验 Thalamus 可用性 |
| GET | `/token/status` | Cursor Token 状态 | DA 诊断 Thalamus 连接问题 |

辅助端点（CC SDK 兼容性）：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/hello` | CC SDK 启动连通性检查 |
| GET | `/v1/oauth/hello` | CC SDK auth 健康检查 |
| POST | `/v1/messages/count_tokens` | Token 计数（返回 dummy 值） |
| POST | `/token/update` | 手动设置 Cursor token |
| POST | `/token/clear` | 清除 token |
| GET | `/cursor/login` | PKCE 登录流程（生成浏览器登录 URL） |
| GET | `/cursor/poll` | 轮询登录结果 |

### Thalamus 核心能力

- **双格式入口**：同时支持 Anthropic Messages API 和 OpenAI Chat Completions API
- **流式 SSE**：token 级别的流式输出（1-15 字符/事件），DA 可以逐 token 展示思考过程
- **工具调用**：通过 prompt injection 注入工具定义，文本解析工具调用结果（非 protobuf native）
- **模型映射**：自动将 `claude-*`、`inherit`、`sonnet`、`opus`、`haiku` 等映射到 Cursor 可用模型
- **双重注入**：System prompt 和工具定义同时注入到 Cursor 请求的 `instruction.instruction` 和 `messages[0]`
- **Thinking 暴露**：`<think>` 标签内容作为 `text_delta` 带 `thinking: ` 前缀输出，DA 可直接展示

### DA 如何调用 Thalamus

```go
// DA 发送思考请求（Go 伪代码）
resp, err := http.Post("http://localhost:3013/v1/messages", "application/json", body)
// body: {"model": "default", "messages": [...], "stream": true, "tools": [...]}
// 返回: SSE 流，逐 token 输出 DA 的思考/工具调用
```

DA 的所有"思考"都通过 Thalamus 完成。DA 不直接调 Cursor API，也不直接调 Anthropic API。Thalamus 是唯一的 LLM 网关。

### Thalamus 路径

```
../cursor-source-analysis/thalamus-py/
├── server.py              # FastAPI 入口，所有端点定义
├── claude_code/
│   ├── pipeline.py        # 核心流式处理管线
│   ├── normalizers.py     # Anthropic/OpenAI → UnifiedRequest 归一化
│   ├── sse_assembler.py   # SSE 事件组装
│   └── tool_prompt_builder.py  # 工具定义 prompt injection
├── core/
│   ├── protobuf_builder.py    # Cursor protobuf 请求构建
│   ├── cursor_h2_client.py    # Cursor H2/gRPC 客户端
│   └── unified_request.py     # 内部统一请求格式
└── config/
    └── system_prompt.py       # DA 身份叙事 + 增强指令
```

## 调研与参考项目

### 直接参考

| 项目 | 用途 | 链接 |
|------|------|------|
| opencode-ai/opencode | Fork 基础（Go, Bubbletea TUI, Agent 循环） | [GitHub](https://github.com/opencode-ai/opencode) |
| charmbracelet/crush | OpenCode 继承者，参考其新特性 | [GitHub](https://github.com/charmbracelet/crush) |
| Yuyz0112/claude-code-reverse | Claude Code 内部机制分析 | [GitHub](https://github.com/Yuyz0112/claude-code-reverse) |

### 参考项目详细调研（reference/ 目录）

20 个项目按 CC 控制方式分为三个流派：

#### tmux 流派（与 Vibe Vibing 同一技术路线）

| 项目 | 技术栈 | 有编排层 | 参考价值 | 关键发现 |
|------|--------|----------|----------|----------|
| **agent-conductor** | Python + FastAPI + libtmux | Supervisor → Worker | ★★★★★ | **最相关**——libtmux 的 send_keys/capture_pane 用法、inbox/approval 协调机制 |
| **cj-claude-swarm** | Node.js + MCP + tmux | Orchestrator CC → Worker CC | ★★★★★ | MCP 工具设计、Worker 生命周期、git worktree 隔离 |
| **claude-colony** | Node.js + tmux | Manager + Specialist | ★★★★ | tmux + 文件消息 broker 的协作模式 |
| **claude-squad** | Go | 无 | ★★★★ | TUI 管理多 CC、yolo/auto-accept、diff 预览 |
| **devteam** | Node.js + tmux | 无 | ★★★★ | diff 查看、评论下发、PR 状态管理 |
| **swarm** | Rust + tmux | 无 | ★★★★ | YOLO 模式、allowed_tools、/worktree 交互 |
| **tmuxcc** | Rust + Ratatui | 无 | ★★★★ | **CC 审批状态解析**——识别 Edit/Shell/Question 等状态 |
| **agentboard** | TypeScript + xterm.js | 无 | ★★★ | tmux 的 Web GUI，远程 SSH + 状态推断 |

#### SDK / subprocess 流派

| 项目 | 技术栈 | 有编排层 | 参考价值 | 关键发现 |
|------|--------|----------|----------|----------|
| **affaan-claude-swarm** | Python + claude-agent-sdk | Opus 分解 + Haiku 执行 + Opus 质检 | ★★★★★ | 任务分解 + 依赖图调度 + 质检流程 |
| **claude-orchestrator** | Node.js + Bash + GitHub CLI | Quality Agents 审查 PR | ★★★★ | worktree 隔离、交付流水线、质量门控 |
| **companion** | Bun + Hono + React | 无 | ★★★★ | `--sdk-url` 协议、WebSocket 桥接、权限审批 UI |
| **parallel-cc** | Node.js + SQLite | 无 | ★★★★ | SQLite 协调、worktree 自动创建、heartbeat 检测 |
| **xlaude** | Rust | 无 | ★★★ | worktree 生命周期、session 发现 |

#### 其他流派

| 项目 | 技术栈 | 有编排层 | 参考价值 | 关键发现 |
|------|--------|----------|----------|----------|
| **tmux-mcp** | Node.js + MCP | 无 | ★★★ | MCP 暴露 tmux 能力——DA 可通过 MCP 调用 tmux |
| **agent-tmux-monitor** | Rust + Hooks | 无 | ★★★ | CC Hooks（PreToolUse/PostToolUse）集成 |
| **claude-swarm-monitor** | Rust | 无 | ★★★ | 从 `~/.claude/projects/` JSONL 推断状态 |
| **claude-code-by-agents** | Deno + React + Electron | Orchestrator → 多 Agent | ★★★ | HTTP API 编排，与 tmux 方案不同 |
| **claude-octopus** | CC Plugin | 多模型角色分工 | ★★ | 多模型共识机制（75% 共识门） |
| **claude-orchestration** | CC Plugin | Flow 语法子 Agent | ★★ | 工作流编排语法，非多 CC 实例 |
| **claude-swarm (parruda)** | Ruby + RubyLLM | delegates_to 委托 | ★ | 不依赖 CC，与本项目无关 |

### 核心参考项目 Top 3

1. **agent-conductor**（★★★★★）：与 Vibe Vibing 架构最接近。Python + libtmux，Supervisor/Worker 委托模式，send_keys/capture_pane 控制，inbox/approval 协调。**直接抄它的 tmux 控制层设计。**

2. **cj-claude-swarm**（★★★★★）：MCP + tmux 编排。每个 Worker 是 tmux session 中的 CC 实例，Orchestrator 通过 MCP 工具 `start_worker` 创建。Ralph Loop、协议约束、竞争规划等高级编排模式。**借鉴它的 Worker 生命周期管理。**

3. **affaan-claude-swarm**（★★★★★）：虽然用 SDK 而非 tmux，但它的编排逻辑最成熟——Opus 分解任务、Haiku 并行执行、Opus 质检。依赖图调度。**借鉴它的任务分解 + 质检流程。**

### 关键技术发现

**tmux 控制 CC 的核心命令**：

```bash
# 创建新 CC
tmux split-window -h "claude"

# 向 CC 发送 prompt
tmux send-keys -t <pane> "重构 src/utils.ts" Enter

# 读取 CC 画面
tmux capture-pane -t <pane> -p

# 发送特殊按键
tmux send-keys -t <pane> y        # 批准权限
tmux send-keys -t <pane> Escape   # 中断

# 移动 pane（雪藏/恢复）
tmux move-pane -s :main.<n> -t :archived
```

**CC TUI 状态解析**（从 `capture-pane` 输出中识别）：

| TUI 特征 | 状态 | DA 动作 |
|-----------|------|---------|
| 末行 `> ` | idle | 可以 `send-keys` 发送新 prompt |
| `⠋ Thinking` | thinking | 等待 |
| `Allow` / `Deny` 按钮 | permission | `send-keys y` 或 `ask_user` |
| `Tool: Read/Write/Bash` | tool_use | 等待 |
| `Session expired` | error | 诊断 + 重启 |

**选择 Fork opencode 而非 crush 的原因**：opencode MIT，crush FSL-1.1-MIT（禁止竞争性商业使用）。架构几乎相同。

## 哲学基础与反思

Vibe Vibing 的设计不仅是工程决策，也是一次关于"LLM 能否通过纯语言操控完成实际工作"的实验。

### 支撑设计的哲学观点

**维特根斯坦："意义即用法"**

DA 从未写过一行代码，但它通过"指挥别人写代码"的用法模式来表现理解。如果理解可以在纯语言层面传递（用户 → DA → tmux send-keys → CC → 代码），就证明了意义确实不需要超越语言的基础。

**德里达："没有文本之外"**

DA 的整个"世界"就是文本——左侧是用户的消息，右侧是 `capture-pane` 抓取的 CC 画面文本。它对代码的理解就是这些文本之间的关系网络。

**萨丕尔-沃尔夫假说：语言塑造思维**

System prompt 就是 DA 的"母语"。写"你是项目经理"和写"你是初级开发者"，同一个模型会产出完全不同的行为。System prompt 的设计不只是工程问题，而是在定义一种"语言游戏"的规则。

### 批判与自省

**"电话游戏"效应**：双层 LLM 的信息传递不是线性衰减，而是非线性共振。DA 会在错误方向上"自信地具体化"。→ 解法：右侧面板就是 CC 的真实 TUI，用户实时可见。

**"理解的悬崖"**：DA 不会表现出平滑的"部分理解"，它要么正确要么自信地离谱。→ 解法：状态机强制 plan → confirm → execute。

**"知道何时停下来"**：DA 的铲子永远不会弯，它可以无限重试。→ 解法：熔断机制——硬上限制造"坚硬的岩石"。

**tmux 的脆弱性**：`capture-pane` 解析 TUI 文本本质上是脆弱的——CC 的 TUI 渲染格式变了就会 break。→ 解法：状态解析模块独立封装，CC 版本升级时只需更新解析规则。

### 根本性问题

> 如果一个 AI 可以通过"在终端里打字"来操控另一个 AI 完成编程任务——那"操控终端"和"理解代码"之间，还有本质区别吗？

## 项目结构

```
vibe-vibing/
├── README.md
├── backend/               # Go 后端（Fork opencode，DA 核心）
│   ├── cmd/               # CLI 入口
│   ├── internal/
│   │   ├── agent/         # DA Agent 循环 + 状态机
│   │   ├── cc/            # CC 实例管理
│   │   │   ├── tmux.go    # tmux 命令封装（send-keys, capture-pane, split-window）
│   │   │   ├── parser.go  # capture-pane 输出解析 → CC 状态
│   │   │   ├── pool.go    # CC 实例池（活跃 + 归档）
│   │   │   └── types.go   # CCInstance, CCState 类型
│   │   ├── tools/         # DA 工具实现
│   │   │   ├── cc_new.go
│   │   │   ├── cc_send.go
│   │   │   ├── cc_read.go
│   │   │   ├── cc_key.go
│   │   │   ├── cc_archive.go
│   │   │   ├── cc_restore.go
│   │   │   ├── cc_focus.go
│   │   │   ├── cc_status.go
│   │   │   ├── bash.go
│   │   │   ├── read_file.go
│   │   │   ├── plan.go
│   │   │   └── ask_user.go
│   │   ├── tui/           # DA 的 TUI 界面
│   │   │   ├── layout.go  # 左右分屏（左: DA chat, 右: CC pane mirrors）
│   │   │   ├── chat.go    # 左侧 DA 对话面板
│   │   │   ├── cc_view.go # 右侧 CC 面板（capture-pane 渲染）
│   │   │   └── bar.go     # 底部状态栏
│   │   ├── config/
│   │   └── db/            # SQLite（DA 会话 + CC 实例注册表）
│   └── go.mod
├── reference/             # 已调研的同类项目源码
├── src/                   # Electron 前端（计划中）
├── main/                  # Electron 主进程（计划中）
└── dist/
```

## 开发路线

1. Fork opencode-ai/opencode，清理不需要的模块
2. 实现 `internal/cc/tmux.go`（tmux 命令封装：split-window, send-keys, capture-pane, move-pane）
3. 实现 `internal/cc/parser.go`（capture-pane 输出解析：CC 状态识别）
4. 实现 `internal/cc/pool.go`（CC 实例池：创建、雪藏、恢复、列表）
5. 实现 CC 操控工具组（cc_new, cc_send, cc_read, cc_key, cc_status, cc_archive, cc_restore, cc_focus）
6. 实现交互工具（plan, ask_user）+ 诊断工具（bash, read_file）
7. 实现状态机门控、熔断机制、分歧检测
8. 改造 TUI 布局（左: DA chat, 右: CC pane 镜像渲染）
9. 底部状态栏（Thalamus 连接状态、活跃/归档 CC 数量、费用统计）
10. 配置 Thalamus 为 DA 的 LLM 后端
11. CLI 入口：`vibe-vibing` 启动 tmux session + DA TUI
12. Electron 前端接入（后续）

## 许可证

MIT
