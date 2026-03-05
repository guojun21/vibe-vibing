import { config } from '../server-configuration-loader'
import { PipePaneTerminalProxy } from './tmux-pipe-pane-terminal-proxy'
import { PtyTerminalProxy } from './pty-based-terminal-proxy'
import { SshTerminalProxy } from './ssh-remote-terminal-proxy'
import type { ITerminalProxy, TerminalProxyOptions } from './terminal-proxy-type-definitions'

function resolveTerminalMode(): 'pty' | 'pipe-pane' {
  if (config.terminalMode === 'pipe-pane') {
    return 'pipe-pane'
  }
  if (config.terminalMode === 'pty') {
    return 'pty'
  }

  return process.stdin.isTTY ? 'pty' : 'pipe-pane'
}

function createTerminalProxy(options: TerminalProxyOptions): ITerminalProxy {
  const mode = resolveTerminalMode()
  return mode === 'pty'
    ? new PtyTerminalProxy(options)
    : new PipePaneTerminalProxy(options)
}

function createSshTerminalProxy(options: TerminalProxyOptions): ITerminalProxy {
  return new SshTerminalProxy(options)
}

export { createTerminalProxy, createSshTerminalProxy, resolveTerminalMode }
