import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ServerMessage } from '@shared/shared-message-and-session-types'
import Header from './components/application-header-bar'
import Terminal from './components/single-session-terminal-view'
import TeamView from './components/team-view'
import { TeamSidebar } from './components/team-sidebar'
import NewSessionModal from './components/new-session-creation-modal'
import SettingsModal from './components/settings-configuration-modal'
import { ToastViewport, toastManager } from './components/toast-notification-viewport'
import { useSessionStore } from './stores/session-state-store'
import {
  useSettingsStore,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './stores/settings-persistence-store'
import { useTeamStore } from './stores/team-state-store'
import { useThemeStore } from './stores/theme-preference-store'
import { useWebSocket } from './hooks/use-shared-websocket-connection'
import { useVisualViewport } from './hooks/use-visual-viewport-adjustment'
import { sortSessions } from './utils/session-sorting-utilities'
import { setClientLogLevel } from './utils/client-side-logging'
import { getEffectiveModifier, matchesModifier } from './utils/device-detection-and-modifier-keys'
import { playPermissionSound, playIdleSound, primeAudio, needsUserGesture } from './utils/notification-sound-playback'

interface ServerInfo {
  port: number
  tailscaleIp: string | null
  protocol: string
}

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newSessionInitialHost, setNewSessionInitialHost] = useState<string | undefined>(undefined)
  const [newSessionInitialPath, setNewSessionInitialPath] = useState<string | undefined>(undefined)
  const [newSessionInitialCommand, setNewSessionInitialCommand] = useState<string | undefined>(undefined)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)

  const sessions = useSessionStore((state) => state.sessions)
  const agentSessions = useSessionStore((state) => state.agentSessions)
  const selectedSessionId = useSessionStore(
    (state) => state.selectedSessionId
  )
  const setSessions = useSessionStore((state) => state.setSessions)
  const setAgentSessions = useSessionStore((state) => state.setAgentSessions)
  const setHostStatuses = useSessionStore((state) => state.setHostStatuses)
  const updateSession = useSessionStore((state) => state.updateSession)
  const setSelectedSessionId = useSessionStore(
    (state) => state.setSelectedSessionId
  )
  const hasLoaded = useSessionStore((state) => state.hasLoaded)
  const connectionStatus = useSessionStore(
    (state) => state.connectionStatus
  )
  const connectionError = useSessionStore((state) => state.connectionError)
  const clearExitingSession = useSessionStore((state) => state.clearExitingSession)
  const markSessionExiting = useSessionStore((state) => state.markSessionExiting)
  const setRemoteAllowControl = useSessionStore((state) => state.setRemoteAllowControl)
  const setRemoteAllowAttach = useSessionStore((state) => state.setRemoteAllowAttach)
  const setHostLabel = useSessionStore((state) => state.setHostLabel)
  const hostStatuses = useSessionStore((state) => state.hostStatuses)
  const remoteAllowControl = useSessionStore((state) => state.remoteAllowControl)
  const hostLabel = useSessionStore((state) => state.hostLabel)

  const {
    teams,
    selectedTeamId,
    teamStatuses,
    daMessages,
    setTeams,
    addTeam,
    updateTeamInStore,
    selectTeam,
    setTeamStatus,
    setDAMessages,
    addDAMessage,
    addDAAgentEvent,
    clearDAAgentEvents,
    setDAAgentRunning,
  } = useTeamStore()

  const theme = useThemeStore((state) => state.theme)
  const defaultProjectDir = useSettingsStore(
    (state) => state.defaultProjectDir
  )
  const commandPresets = useSettingsStore((state) => state.commandPresets)
  const defaultPresetId = useSettingsStore((state) => state.defaultPresetId)
  const lastProjectPath = useSettingsStore((state) => state.lastProjectPath)
  const setLastProjectPath = useSettingsStore(
    (state) => state.setLastProjectPath
  )
  const addRecentPath = useSettingsStore((state) => state.addRecentPath)
  const shortcutModifier = useSettingsStore((state) => state.shortcutModifier)
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth)
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth)
  const projectFilters = useSettingsStore((state) => state.projectFilters)
  const hostFilters = useSettingsStore((state) => state.hostFilters)
  const soundOnPermission = useSettingsStore((state) => state.soundOnPermission)
  const soundOnIdle = useSettingsStore((state) => state.soundOnIdle)

  const { sendMessage, subscribe, connectionEpoch } = useWebSocket()

  // Handle mobile keyboard viewport adjustments
  useVisualViewport()

  // Prime audio on user interaction. Persistent listener (not once) because Safari
  // suspends AudioContext after sleep/wake and needs a fresh gesture to resume.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!soundOnPermission && !soundOnIdle) return

    let primed = false
    const unlockAudio = () => {
      // After initial prime, only re-prime when wake detection flags it
      if (primed && !needsUserGesture()) return
      primed = true
      void primeAudio()
    }

    document.addEventListener('click', unlockAudio, { passive: true })
    document.addEventListener('keydown', unlockAudio, { passive: true })
    document.addEventListener('touchstart', unlockAudio, { passive: true })

    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
      document.removeEventListener('touchstart', unlockAudio)
    }
  }, [soundOnPermission, soundOnIdle])

  // Sidebar resize handling
  const isResizing = useRef(false)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    // Guard for SSR/test environments where document.addEventListener may not exist
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = e.clientX
      setSidebarWidth(
        Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth))
      )
    }

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setSidebarWidth])

  useEffect(() => {
    const unsubscribe = subscribe((message: ServerMessage) => {
      if (import.meta.env.DEV) {
        console.log('[WS recv]', message.type, message)
      }
      if (message.type === 'sessions') {
        // Detect status transitions for sound notifications before updating
        const currentSessions = useSessionStore.getState().sessions
        const { soundOnPermission, soundOnIdle } = useSettingsStore.getState()

        if (soundOnPermission || soundOnIdle) {
          for (const nextSession of message.sessions) {
            const prevSession = currentSessions.find((s) => s.id === nextSession.id)
            if (prevSession && prevSession.status !== nextSession.status) {
              if (prevSession.status !== 'permission' && nextSession.status === 'permission' && soundOnPermission) {
                void playPermissionSound()
              }
              if (prevSession.status === 'working' && nextSession.status === 'waiting' && soundOnIdle) {
                void playIdleSound()
              }
            }
          }
        }

        setSessions(message.sessions)
      }
      if (message.type === 'host-status') {
        setHostStatuses(message.hosts)
      }
      if (message.type === 'server-config') {
        setRemoteAllowControl(message.remoteAllowControl)
        setRemoteAllowAttach(message.remoteAllowAttach)
        setHostLabel(message.hostLabel)
        if (message.clientLogLevel) {
          setClientLogLevel(message.clientLogLevel)
        }
      }
      if (message.type === 'session-update') {
        // Detect status transitions for sound notifications
        // Capture previous status BEFORE updating to ensure we have the old value
        const currentSessions = useSessionStore.getState().sessions
        const prevSession = currentSessions.find((s) => s.id === message.session.id)
        const prevStatus = prevSession?.status
        const nextStatus = message.session.status

        updateSession(message.session)

        // Only play sounds for known sessions (skip new/unknown sessions)
        if (prevStatus) {
          const { soundOnPermission, soundOnIdle } = useSettingsStore.getState()

          if (prevStatus !== 'permission' && nextStatus === 'permission' && soundOnPermission) {
            void playPermissionSound()
          }
          if (prevStatus === 'working' && nextStatus === 'waiting' && soundOnIdle) {
            void playIdleSound()
          }
        }
      }
      if (message.type === 'session-created') {
        // Add session to list immediately (don't wait for async refresh)
        const currentSessions = useSessionStore.getState().sessions
        if (!currentSessions.some((s) => s.id === message.session.id)) {
          setSessions([message.session, ...currentSessions])
        }
        setSelectedSessionId(message.session.id)
        addRecentPath(message.session.projectPath)

        // Auto-add to filter if filters are active and project isn't included
        const { projectFilters, setProjectFilters } = useSettingsStore.getState()
        if (projectFilters.length > 0 && !projectFilters.includes(message.session.projectPath)) {
          setProjectFilters([...projectFilters, message.session.projectPath])
        }
      }
      if (message.type === 'session-removed') {
        // setSessions handles marking removed sessions as exiting for animation
        const currentSessions = useSessionStore.getState().sessions
        const nextSessions = currentSessions.filter(
          (session) => session.id !== message.sessionId
        )
        if (nextSessions.length !== currentSessions.length) {
          setSessions(nextSessions)
        }
      }
      if (message.type === 'agent-sessions') {
        setAgentSessions(message.active, message.inactive)
      }
      if (message.type === 'session-orphaned') {
        // When a session is superseded by slug (plan→execute transition),
        // don't remove the card — session-activated will update it in place.
        if (!message.supersededBy) {
          const currentSessions = useSessionStore.getState().sessions
          const nextSessions = currentSessions.filter(
            (session) => session.agentSessionId?.trim() !== message.session.sessionId
          )
          if (nextSessions.length !== currentSessions.length) {
            setSessions(nextSessions)
          }
        }
      }
      if (message.type === 'session-activated') {
        // Update the session card's agent metadata in place (e.g., after slug supersede
        // or orphan rematch). Merges onto existing card — no-op if no card matches.
        const existing = useSessionStore.getState().sessions.find(
          (s) => s.tmuxWindow === message.window
        )
        if (existing) {
          updateSession({
            ...existing,
            agentSessionId: message.session.sessionId,
            agentSessionName: message.session.displayName,
            logFilePath: message.session.logFilePath,
            isPinned: message.session.isPinned,
            lastUserMessage: message.session.lastUserMessage ?? existing.lastUserMessage,
          })
        }
      }
      if (message.type === 'session-resume-result') {
        if (message.ok && message.session) {
          // Add resumed session to list immediately
          const currentSessions = useSessionStore.getState().sessions
          if (!currentSessions.some((s) => s.id === message.session!.id)) {
            setSessions([message.session, ...currentSessions])
          }
          setSelectedSessionId(message.session.id)
        } else if (!message.ok) {
          setServerError(`${message.error?.code}: ${message.error?.message}`)
          window.setTimeout(() => setServerError(null), 6000)
        }
      }
      if (message.type === 'terminal-error') {
        if (!message.sessionId || message.sessionId === selectedSessionId) {
          setServerError(`${message.code}: ${message.message}`)
          window.setTimeout(() => setServerError(null), 6000)
        }
      }
      if (message.type === 'terminal-ready') {
        if (message.sessionId === selectedSessionId) {
          setServerError(null)
        }
      }
      if (message.type === 'error') {
        setServerError(message.message)
        window.setTimeout(() => setServerError(null), 6000)
      }
      if (message.type === 'kill-failed') {
        // Clear from exiting state since kill failed - session remains active
        clearExitingSession(message.sessionId)
        setServerError(message.message)
        window.setTimeout(() => setServerError(null), 6000)
      }
      if (message.type === 'session-pin-result') {
        if (!message.ok && message.error) {
          setServerError(message.error)
          window.setTimeout(() => setServerError(null), 6000)
        }
      }
      if (message.type === 'session-resurrection-failed') {
        toastManager.add({
          title: 'Session resurrection failed',
          description: `"${message.displayName}" could not be resumed: ${message.error}`,
          type: 'error',
          timeout: 8000,
        })
      }
      if (message.type === 'teams') {
        setTeams(message.teams)
      }
      if (message.type === 'team-created') {
        addTeam(message.team)
        useTeamStore.getState().selectTeam(message.team.teamId)
        sendMessage({ type: 'team-select', teamId: message.team.teamId })
      }
      if (message.type === 'team-updated') {
        updateTeamInStore(message.team)
      }
      if (message.type === 'cc-status-update') {
        const msg = message as any
        const { teamStatuses } = useTeamStore.getState()
        const existing = teamStatuses[msg.teamId]
        if (existing) {
          setTeamStatus({ ...existing, ccStatuses: msg.statuses })
        }
      }
      if (message.type === 'team-status') {
        const existing = useTeamStore.getState().teamStatuses[message.status.teamId]
        setTeamStatus({
          ...message.status,
          ccSessions: (message.status as any).ccSessions ?? existing?.ccSessions ?? [],
          startup: (message.status as any).startup !== undefined ? (message.status as any).startup : existing?.startup,
        })
      }
      if (message.type === 'team-started') {
        const msg = message as any
        const ccSessions = msg.ccSessions ?? []
        setTeamStatus({
          teamId: msg.teamId,
          isRunning: true,
          ccStatuses: {},
          daSessionId: msg.daSessionId ?? null,
          ccSessions,
          startup: null,
        })
      }
      if (message.type === 'da-message') {
        addDAMessage(message.teamId, message.message)
      }
      if (message.type === 'da-history') {
        setDAMessages(message.teamId, message.messages)
      }
      if ((message as any).type === 'da-thinking') {
        const msg = message as any
        setDAAgentRunning(msg.teamId, true)
        addDAAgentEvent(msg.teamId, {
          type: 'thinking',
          step: msg.step,
          content: msg.content,
          timestamp: new Date().toISOString(),
        })
      }
      if ((message as any).type === 'da-tool-call') {
        const msg = message as any
        addDAAgentEvent(msg.teamId, {
          type: 'tool-call',
          step: msg.step,
          toolCalls: msg.toolCalls,
          timestamp: new Date().toISOString(),
        })
      }
      if ((message as any).type === 'da-tool-result') {
        const msg = message as any
        addDAAgentEvent(msg.teamId, {
          type: 'tool-result',
          step: msg.step,
          toolResults: msg.results,
          timestamp: new Date().toISOString(),
        })
      }
      if ((message as any).type === 'da-complete') {
        const msg = message as any
        setDAAgentRunning(msg.teamId, false)
        addDAAgentEvent(msg.teamId, {
          type: 'complete',
          step: 0,
          content: msg.summary,
          timestamp: new Date().toISOString(),
        })
      }
      if ((message as any).type === 'da-error') {
        const msg = message as any
        setDAAgentRunning(msg.teamId, false)
        addDAAgentEvent(msg.teamId, {
          type: 'error',
          step: 0,
          content: msg.error,
          timestamp: new Date().toISOString(),
        })
      }
    })

    return () => { unsubscribe() }
  }, [
    selectedSessionId,
    addRecentPath,
    clearExitingSession,
    sendMessage,
    setSelectedSessionId,
    setSessions,
    setAgentSessions,
    setHostStatuses,
    setRemoteAllowControl,
    setRemoteAllowAttach,
    setHostLabel,
    subscribe,
    updateSession,
    setTeams,
    addTeam,
    updateTeamInStore,
    setTeamStatus,
    setDAMessages,
    addDAMessage,
  ])

  const selectedSession = useMemo(() => {
    return (
      sessions.find((session) => session.id === selectedSessionId) || null
    )
  }, [selectedSessionId, sessions])

  // Track last viewed project path
  useEffect(() => {
    if (selectedSession?.projectPath && !selectedSession.remote) {
      setLastProjectPath(selectedSession.projectPath)
    }
  }, [selectedSession?.projectPath, selectedSession?.remote, setLastProjectPath])

  const sessionSortMode = useSettingsStore((state) => state.sessionSortMode)
  const sessionSortDirection = useSettingsStore(
    (state) => state.sessionSortDirection
  )
  const manualSessionOrder = useSettingsStore(
    (state) => state.manualSessionOrder
  )

  const sortedSessions = useMemo(
    () =>
      sortSessions(sessions, {
        mode: sessionSortMode,
        direction: sessionSortDirection,
        manualOrder: manualSessionOrder,
      }),
    [sessions, sessionSortMode, sessionSortDirection, manualSessionOrder]
  )

  // Apply filters to sorted sessions for keyboard navigation
  const filteredSortedSessions = useMemo(() => {
    let next = sortedSessions
    if (projectFilters.length > 0) {
      next = next.filter((session) => projectFilters.includes(session.projectPath))
    }
    if (hostFilters.length > 0) {
      next = next.filter((session) => hostFilters.includes(session.host ?? ''))
    }
    return next
  }, [sortedSessions, projectFilters, hostFilters])

  // Auto-select first visible session when current selection is filtered out
  useEffect(() => {
    if (
      selectedSessionId &&
      filteredSortedSessions.length > 0 &&
      !filteredSortedSessions.some((s) => s.id === selectedSessionId)
    ) {
      setSelectedSessionId(filteredSortedSessions[0].id)
    }
  }, [selectedSessionId, filteredSortedSessions, setSelectedSessionId])

  // Auto-select first session on mobile when sessions load
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches
    if (isMobile && hasLoaded && selectedSessionId === null && sortedSessions.length > 0) {
      setSelectedSessionId(sortedSessions[0].id)
    }
  }, [hasLoaded, selectedSessionId, sortedSessions, setSelectedSessionId])


  const handleKillSession = useCallback((sessionId: string) => {
    // Mark as exiting before sending kill to preserve session data for exit animation
    markSessionExiting(sessionId)
    sendMessage({ type: 'session-kill', sessionId })
  }, [markSessionExiting, sendMessage])

  useEffect(() => {
    const effectiveModifier = getEffectiveModifier(shortcutModifier)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      // Use event.code for consistent detection across browsers
      // (event.key fails in Chrome/Arc on macOS due to Option dead keys)
      const code = event.code
      const isShortcut = matchesModifier(event, effectiveModifier)

      // Bracket navigation: [mod]+[ / ]
      if (isShortcut && (code === 'BracketLeft' || code === 'BracketRight')) {
        event.preventDefault()
        // Use filtered sessions so navigation respects project filter
        const navSessions = filteredSortedSessions
        if (navSessions.length === 0) return
        const currentIndex = navSessions.findIndex(s => s.id === selectedSessionId)
        if (currentIndex === -1) {
          setSelectedSessionId(navSessions[0].id)
          return
        }
        const delta = code === 'BracketLeft' ? -1 : 1
        const newIndex = (currentIndex + delta + navSessions.length) % navSessions.length
        setSelectedSessionId(navSessions[newIndex].id)
        return
      }

      // New session: [mod]+N
      if (isShortcut && code === 'KeyN') {
        event.preventDefault()
        if (!isModalOpen) {
          setIsModalOpen(true)
        }
        return
      }

      // Kill session: [mod]+X
      if (isShortcut && code === 'KeyX') {
        event.preventDefault()
        if (selectedSessionId && !isModalOpen) {
          handleKillSession(selectedSessionId)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, selectedSessionId, setSelectedSessionId, filteredSortedSessions, handleKillSession, shortcutModifier])

  const handleNewSession = () => {
    setNewSessionInitialHost(undefined)
    setNewSessionInitialPath(undefined)
    setNewSessionInitialCommand(undefined)
    setIsModalOpen(true)
  }
  const handleOpenSettings = () => setIsSettingsOpen(true)

  const handleCreateSession = (
    projectPath: string,
    name?: string,
    command?: string,
    host?: string
  ) => {
    sendMessage({ type: 'session-create', projectPath, name, command, host })
    if (!host) setLastProjectPath(projectPath)
  }

  const handleResumeSession = (sessionId: string) => {
    sendMessage({ type: 'session-resume', sessionId })
  }

  const handleRenameSession = (sessionId: string, newName: string) => {
    sendMessage({ type: 'session-rename', sessionId, newName })
  }

  const handleDuplicateSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    sendMessage({
      type: 'session-create',
      projectPath: session.projectPath,
      command: session.command || undefined,
      host: session.remote && session.host ? session.host : undefined,
    })
  }, [sessions, sendMessage])

  const handleSetPinned = useCallback((sessionId: string, isPinned: boolean) => {
    sendMessage({ type: 'session-pin', sessionId, isPinned })
  }, [sendMessage])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Fetch server info (including Tailscale IP) on mount
  useEffect(() => {
    fetch('/api/server-info')
      .then((res) => res.json())
      .then((info: ServerInfo) => setServerInfo(info))
      .catch(() => {})
  }, [])

  const remoteHostStatuses = useMemo(() => {
    if (!hostLabel) return hostStatuses
    return hostStatuses.filter((hostStatus) => hostStatus.host !== hostLabel)
  }, [hostStatuses, hostLabel])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left column: header + sidebar - always hidden on mobile (drawer handles it) */}
      <div
        className="hidden h-full min-h-0 flex-col overflow-hidden md:flex md:shrink-0"
        style={{ width: sidebarWidth }}
      >
        <Header
          connectionStatus={connectionStatus}
          onNewSession={handleNewSession}
          onOpenSettings={handleOpenSettings}
          tailscaleIp={serverInfo?.tailscaleIp ?? null}
        />
        <TeamSidebar
          sendMessage={sendMessage}
          sessions={sessions}
          inactiveSessions={agentSessions.inactive}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          onRenameSession={handleRenameSession}
          onResumeSession={handleResumeSession}
          onKillSession={handleKillSession}
          onDuplicateSession={handleDuplicateSession}
          onSetPinned={handleSetPinned}
          loading={!hasLoaded}
          error={connectionError || serverError}
        />
      </div>

      {/* Sidebar resize handle */}
      <div
        className="hidden md:block w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-white/10 active:bg-white/20"
        onMouseDown={handleResizeStart}
      />

      {/* Main content: TeamView when a team is selected, otherwise single Terminal */}
      {selectedTeamId ? (
        <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
          <TeamView teamId={selectedTeamId} sendMessage={sendMessage} />
        </div>
      ) : (
        <Terminal
          session={selectedSession}
          sessions={filteredSortedSessions}
          connectionStatus={connectionStatus}
          connectionEpoch={connectionEpoch}
          sendMessage={sendMessage}
          subscribe={subscribe}
          onClose={() => setSelectedSessionId(null)}
          onSelectSession={setSelectedSessionId}
          onNewSession={handleNewSession}
          onKillSession={handleKillSession}
          onRenameSession={handleRenameSession}
          onOpenSettings={handleOpenSettings}
          onResumeSession={handleResumeSession}
          onSetPinned={handleSetPinned}
          inactiveSessions={agentSessions.inactive}
          loading={!hasLoaded}
          error={connectionError || serverError}
        />
      )}

      <NewSessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateSession}
        defaultProjectDir={defaultProjectDir}
        commandPresets={commandPresets}
        defaultPresetId={defaultPresetId}
        lastProjectPath={lastProjectPath}
        activeProjectPath={selectedSession && !selectedSession.remote ? selectedSession.projectPath : undefined}
        remoteHosts={remoteHostStatuses}
        remoteAllowControl={remoteAllowControl}
        initialHost={newSessionInitialHost}
        initialPath={newSessionInitialPath}
        initialCommand={newSessionInitialCommand}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ToastViewport />
    </div>
  )
}
