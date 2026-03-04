# Vibe Curlaude

> 用 AI 代替你进行 vibe coding。你下指令，Agent 去操控 Claude Code。

Vibe Curlaude 是一个 **Delegate Agent**——一个 AI 项目经理，它不直接写代码，而是通过操控 Claude Code CLI（`claude -p`）来完成编程任务。用户在左侧面板与 Agent 对话，Agent 在右侧面板指挥 Claude Code 执行。

## 核心设计理念

**右侧的 Claude Code 不受用户控制，而是受 Delegate Agent 控制。**

这是 Vibe Curlaude 最核心的设计原则。用户只和左侧的 Agent 对话，Agent 负责：

- 理解用户意图
- 阅读代码来了解上下文
- 制定执行计划并征求用户确认
- 生成精确的 prompt 给 Claude Code
- 监控 Claude Code 的执行过程
- 当 Claude Code 出问题时进行诊断（网络、认证、额度等）
- 汇报执行结果

用户是决策者，Agent 是执行者，Claude Code 是工具。

## 架构

```
┌──────────────────────────┬──────────────────────────┐
│    左侧：用户 ↔ Agent    │    右侧：Agent → CC      │
│                          │                          │
│  User: 帮我重构 utils    │  [claude -p] Running...  │
│  Agent: 我先看看代码结构  │  > Reading src/utils.ts  │
│  Agent: 计划如下...      │  > Editing file...       │
│  Agent: 开始执行         │  > Tool: Write           │
│                          │  Cost: $0.12 / 5 turns   │
│  [输入框]               │  Agent 发送的 prompt:     │
│                          │  "重构 src/utils.ts..."  │
│                          │  [ESC] 取消当前任务       │
└──────────────────────────┴──────────────────────────┘
│ Thalamus: Connected | CC: Running | $0.08 total      │
└──────────────────────────────────────────────────────┘
```

### 技术栈

- **后端**: Fork [opencode-ai/opencode](https://github.com/opencode-ai/opencode)（Go, MIT 许可）
- **TUI**: Bubbletea（Charm 生态）
- **LLM 后端**: [Thalamus](../thalamus-py/)（Anthropic Messages API 代理 → Cursor API）
- **编码执行**: Claude Code CLI（`claude -p --output-format stream-json`）
- **前端**（计划中）: Electron + React（`./src/`, `./main/`）

### 数据流

```
用户输入
  → Delegate Agent（经 Thalamus 调用 LLM）
    → Agent 选择工具
      → cc_start / cc_send / cc_stop / ...
        → Claude Code CLI 子进程
          → stream-json 实时输出 → 右侧面板渲染
        → 执行结果返回 Agent
      → bash（诊断命令）
      → read_file（理解代码）
      → plan / ask_user（与用户交互）
    → Agent 决定下一步
  → 回复用户
```

## 工具集

Delegate Agent 拥有 8 个工具，分为 4 组。

### CC 操控组

Agent 对 Claude Code 的完整控制能力，基于 `claude -p` CLI 的功能设计。

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `cc_start` | 启动新的 CC 会话 | `prompt`, `cwd`, `model`, `max_turns`, `max_budget_usd`, `tools`, `session_id` |
| `cc_send` | 向已有会话追加 prompt | `prompt`, `session_id`, `max_turns` |
| `cc_stop` | 中止当前 CC 执行 | — |
| `cc_status` | 查询 CC 实时状态 | — |

**cc_start** 对应 `claude -p "<prompt>" --output-format stream-json --verbose --max-turns N`。
**cc_send** 对应 `claude -p "<prompt>" --session-id <id>`，用于分步执行计划时在同一上下文中继续。
**cc_stop** 发送 SIGTERM（3 秒后 SIGKILL），同时右侧面板 ESC 键也触发此工具。

### 诊断组

| 工具 | 用途 |
|------|------|
| `bash` | 通用 shell 命令，Agent 自主决定如何诊断 |

典型诊断场景：
- `claude auth status --text` → 检查登录状态
- `which claude` → 检查 CLI 是否安装
- `curl -s https://api.anthropic.com/v1/messages -I` → API 可达性
- `curl localhost:3013/health` → Thalamus 健康检查
- `df -h .` → 磁盘空间

### 信息获取组

| 工具 | 用途 |
|------|------|
| `read_file` | 读取文件内容（Agent 在制定计划前理解代码） |

### 交互组

| 工具 | 用途 |
|------|------|
| `plan` | 在左侧面板展示结构化计划 |
| `ask_user` | 向用户提问并等待回答 |

## 安全机制

基于对"双层 LLM 电话游戏效应"的反思，Vibe Curlaude 内置了多个工程级保障。

### 状态机门控

Agent 的行为流程不依赖 system prompt 的"软约束"，而是在 Go 代码层面硬性实现状态机：

```
Idle → Planning → Confirmed → Executing → Reviewing
```

非法的状态转移（比如跳过 plan 直接 cc_start）在代码层面被拒绝，不留给 LLM "自行判断"的空间。

### Prompt 透明度

右侧面板**完整展示 Agent 给 CC 写的 prompt 原文**。用户可以在第一时间发现 Agent 对自己意图的"翻译"偏差，而不是等到 CC 执行完毕才发现方向错了。这是最廉价的"人在回路"措施。

### 熔断机制

三个维度的硬上限，超过阈值强制暂停并升级到 ask_user：

- **Turn 上限**: 单个 CC 会话不超过 15 个 turns
- **文件修改范围**: 单次会话修改超过 8 个文件时强制暂停
- **失败重试**: 同一目标尝试 2 次 CC 会话未达标后，强制要求用户介入

### 分歧检测

从 Agent 的 plan 中提取预期行为（修改哪些文件、预计多少步），与 CC 的 stream-json 实际行为做实时 diff。CC 偏离计划时自动告警暂停。

## 调研与参考项目

### 直接参考

| 项目 | 用途 | 链接 |
|------|------|------|
| opencode-ai/opencode | Fork 基础（Go, Bubbletea TUI, Agent 循环） | [GitHub](https://github.com/opencode-ai/opencode) |
| charmbracelet/crush | OpenCode 继承者，参考其新特性 | [GitHub](https://github.com/charmbracelet/crush) |
| Yuyz0112/claude-code-reverse | Claude Code 内部机制分析 | [GitHub](https://github.com/Yuyz0112/claude-code-reverse) |

### 已调研的同类项目

| 项目 | 技术栈 | 关键发现 |
|------|--------|----------|
| claude-squad | Go + Bubbletea | 会话管理器，非 Agent——通过 PTY 模拟键盘操作 CC，无 LLM 循环 |
| tmuxcc | Rust + Ratatui | 类似 claude-squad，用 tmux pane 内容检测 + 标题 spinner 解析 |
| multi-agent-coding-system | Python | Orchestrator → Subagent，知识制品通过 Context Store 传递 |
| ralph | Shell | 自主循环，CC 作为执行器反复运行直到 PRD 完成，记忆靠 git + AGENTS.md |
| Mastra Code | TypeScript | 观察性记忆，永不 compact，pi-tui + ast-grep |

### 关键技术发现

**Claude Code CLI 能力**（基于 `claude --help` 和逆向分析）：

- 会话管理: `--session-id`, `-c` (continue), `-r` (resume), `--fork-session`
- 非交互模式: `-p` (print mode), `--output-format stream-json|json|text`
- 资源限制: `--max-turns N`, `--max-budget-usd N`, `--fallback-model`
- 认证管理: `claude auth login/logout/status`
- 工具限制: `--tools "Bash,Edit,Read"` 可限制 CC 使用的工具集
- 调试: `--debug "api,mcp"`, `--verbose`

**Thalamus 对 tool_use 的支持**：

- `tools` 参数：已透传
- 请求中的 `tool_use` / `tool_result`：已解析
- 响应中的 `tool_use`：已输出（流式与非流式）
- `tool_choice`：未支持（需要时可扩展）

**选择 Fork opencode 而非 crush 的原因**：

- opencode: MIT 许可，完全自由
- crush: FSL-1.1-MIT，禁止竞争性商业使用（个人使用 OK，但 MIT 更安全）
- 架构几乎相同，opencode 是 crush 的前身

## 哲学基础与反思

Vibe Curlaude 的设计不仅是工程决策，也是一次关于"LLM 能否通过纯语言操控完成实际工作"的实验。

### 支撑设计的哲学观点

**维特根斯坦："意义即用法"**

Delegate Agent 从未写过一行代码，但它通过"指挥别人写代码"的用法模式来表现理解。这是"意义即用法"的双层验证——如果理解可以在纯语言层面传递（用户 → Agent → prompt → CC → 代码），就证明了意义确实不需要超越语言的基础。

有研究者直接称 LLM 为"维特根斯坦机器"：它从未见过一棵树、一条狗，但它学会了词语在语境中如何被使用，然后就能在新语境中正确使用这些词。

**德里达："没有文本之外"**

Agent 的整个"世界"就是文本。它对代码的理解就是代码文本与所有其他文本之间的统计关系网络。Vibe Curlaude 是"没有文本之外"这个哲学命题的工程实现。

**萨丕尔-沃尔夫假说：语言塑造思维**

System prompt 就是 Agent 的"母语"——它决定了 Agent 如何思考。写"你是项目经理"和写"你是初级开发者"，同一个模型会产出完全不同的行为。System prompt 的设计不只是工程问题，而是在定义一种"语言游戏"的规则。

### 设计应该拥抱的关键洞察

**"理解"不是二元的，而是一个光谱。** Agent 没有身体、没有感受、没有意图——但它通过纯粹的语言用法模式，获得了某种很难不称之为"理解"的东西。8 个工具覆盖了理解光谱上的不同位置：高理解度时直接执行，中等时先做计划，低理解度时追问用户，理解失败时用 bash 诊断。

### 批判与自省

以下是对本项目设计的尖锐批判，来自我们对方案的对抗性审视。

**"电话游戏"效应**

双层 LLM 的信息传递不是线性衰减，而是非线性共振。Agent 会在错误方向上"自信地具体化"——把模糊的意图翻译成一个精确但可能错误的 prompt。CC 会高效地执行这个错误 prompt。当两个参与者都没有"生活形式"的锚定时，它们的误解会共振而非抵消。

这是引入"prompt 透明度"的直接原因——让用户实时看到 Agent 给 CC 写的 prompt，在第一时间发现翻译偏差。

**"理解的悬崖"**

Agent 不会表现出平滑的"部分理解"。它要么正确，要么自信地离谱。当用户说"重构这个服务"，Agent 可能把它理解为"拆分文件"（训练数据中最常见的用法），而实际意思是"从同步改成事件驱动"。它不会说"我不确定"——它会输出一个高置信度的错误 prompt。

这是引入"状态机门控"的原因——强制 Agent 先做 plan、先 ask_user 确认，在代码层面阻止跳过确认直接执行。

**"知道何时停下来"**

维特根斯坦说："如果我穷尽了理由，我就触到了坚硬的岩石，我的铲子弯了。" Agent 的铲子永远不会弯——它可以无限地生成新的 plan、新的 prompt、新的重试策略。没有物理阻力来告诉它停下。

这是引入"熔断机制"的原因——用硬上限（turn 数、文件数、重试次数）来人工制造那块"坚硬的岩石"。

**System prompt 不是工程保障**

"先 plan、先 ask_user"写在 system prompt 里，但 LLM 在紧急语境下会跳过。把关键行为约束从 soft constraint 提升为 hard constraint（代码级状态机），是对 LLM 不可靠性的诚实应对。

### 根本性问题

> 如果存在一种不需要意识、不需要身体、纯粹从语言用法中涌现的"理解"——那我们所谓的"人类理解"中，有多少其实也是这样运作的？

Vibe Curlaude 不会回答这个问题。但如果它的 用户 → Agent → CC 链路最终 work，我们就用工程实践在这个问题上又迈了一步。

## 项目结构

```
vibe-curlaude/
├── README.md
├── backend/               # Go 后端（Fork opencode，Delegate Agent 核心）
│   ├── cmd/               # CLI 入口
│   ├── internal/
│   │   ├── agent/         # Agent 循环 + 状态机
│   │   ├── cc/            # Claude Code 子进程管理
│   │   │   ├── runner.go
│   │   │   ├── parser.go  # stream-json 解析
│   │   │   └── types.go
│   │   ├── tools/         # 8 个工具实现
│   │   ├── tui/           # 分屏 TUI
│   │   │   ├── layout.go
│   │   │   ├── chat_panel.go
│   │   │   └── cc_panel.go
│   │   ├── config/
│   │   └── db/            # SQLite 会话存储
│   └── go.mod
├── src/                   # Electron 前端（计划中）
├── main/                  # Electron 主进程（计划中）
└── dist/
```

## 开发路线

1. Fork opencode-ai/opencode，清理不需要的模块
2. 实现 `internal/cc/` 包（CC 子进程管理 + stream-json 解析）
3. 实现 CC 操控工具组（cc_start, cc_send, cc_stop, cc_status）
4. 实现交互工具（plan, ask_user）
5. 实现状态机门控、熔断机制、分歧检测
6. 改造 TUI 为左右分屏布局
7. 右侧面板实时渲染 + ESC 取消 + prompt 透明展示
8. 配置 Thalamus 为 LLM 后端
9. CLI 入口：`vibe-curlaude` 启动 TUI，`vibe-curlaude -p "..."` 非交互模式
10. Electron 前端接入（后续）

## 许可证

MIT
