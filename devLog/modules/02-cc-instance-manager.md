# CC Instance Manager

**文件**: `server/src/cc-instance-manager.ts`, `server/src/cc-status-detector.ts`

## 职责

管理 Claude Code CLI 实例的完整生命周期：创建 tmux 会话 → 启动 CC → 等待 ready → 监控状态 → 停止。

## 核心接口

```typescript
interface CCInstance {
  name: string                // 实例名，如 "agent-1"
  tmuxSessionName: string     // tmux 会话名，如 "5cc79c37-cc-0"
  agentType: string           // "claude-code"
  command: string             // 启动命令，如 "claude"
  projectPath: string         // 工作目录
  status: CCStatus            // 当前状态
  content: string             // 最近一次 pane 抓取内容
  contentHash: string         // 内容 SHA256
  outputFilePath: string      // pipe-pane 输出文件路径
}

type CCStatus = 'unknown' | 'idle' | 'processing' | 'completed' | 'permission' | 'trust-prompt'
```

## 关键函数

| 函数 | 说明 |
|------|------|
| `startCCInstance(name, cmd, projectPath)` | 创建 tmux 会话，加载 nvm，运行 claude 命令，挂载 pipe-pane |
| `waitCCReady(instance, 120s)` | 轮询 pane 内容直到检测为 idle，自动处理 trust prompt |
| `refreshCCInstance(instance)` | 抓取 pane 内容，更新 status |
| `stopCCInstance(instance)` | 断开 pipe-pane，杀掉 tmux 会话 |
| `sendInputToCCInstance(instance, text)` | 向 CC 发送键入 |

## 状态检测 (`cc-status-detector.ts`)

检测逻辑基于 tmux pane 的**最后 20 行非空内容**（避免历史 spinner 字符干扰）：

| 优先级 | 匹配规则 | 返回状态 |
|--------|----------|----------|
| 1 | "trust.*folder" / "safety check.*trust" | `trust-prompt` |
| 2 | "Allow" / "[y/n]" / "Yes.*No" | `permission` |
| 3 | `❯` 空行 prompt + 有 `⏺` 响应标记 | `completed` |
| 4 | `❯` 空行 prompt 或 "? for shortcuts" | `idle` |
| 5 | spinner 字符 (✶⠋ 等) + … | `processing` |
| 6 | 以上都不匹配 | `processing` (默认) |

## 输出持久化

通过 tmux `pipe-pane` 将 CC 终端输出实时写入 `~/.vibe-vibing/cc-outputs/{session}.txt`，供 DA 的 `read_cc_output` 工具读取。
