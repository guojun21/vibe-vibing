package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/user/vibe-curlaude/da"
	"github.com/user/vibe-curlaude/tmux"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type clientMsg struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId,omitempty"`
	Data      string `json:"data,omitempty"`
	Text      string `json:"text,omitempty"`
	Cols      int    `json:"cols,omitempty"`
	Rows      int    `json:"rows,omitempty"`
}

type serverMsg struct {
	Type      string      `json:"type"`
	SessionID string      `json:"sessionId,omitempty"`
	Data      string      `json:"data,omitempty"`
	Text      string      `json:"text,omitempty"`
	Status    string      `json:"status,omitempty"`
	Sessions  []ccSession `json:"sessions,omitempty"`
}

type ccSession struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type Server struct {
	agent   *da.DelegateAgent
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
	port    int
	pipes   map[string]*tmux.PipePaneProxy
}

func NewServer(agent *da.DelegateAgent, port int) *Server {
	return &Server{
		agent:   agent,
		clients: make(map[*websocket.Conn]bool),
		port:    port,
		pipes:   make(map[string]*tmux.PipePaneProxy),
	}
}

func (s *Server) Start() error {
	http.HandleFunc("/ws", s.handleWS)

	// Start pipe-pane proxies for all CC instances
	for _, inst := range s.agent.Instances() {
		sessionID := inst.Session
		proxy := tmux.NewPipePaneProxy(sessionID, func(data string) {
			s.broadcast(serverMsg{
				Type:      "terminal-output",
				SessionID: sessionID,
				Data:      data,
			})
		})
		if err := proxy.Start(); err != nil {
			log.Printf("[WS] pipe-pane proxy failed for %s: %v", sessionID, err)
		} else {
			s.pipes[sessionID] = proxy
			log.Printf("[WS] pipe-pane proxy started for %s", sessionID)
		}
	}

	go s.statusLoop()

	addr := fmt.Sprintf(":%d", s.port)
	log.Printf("[WS] listening on %s", addr)
	return http.ListenAndServe(addr, nil)
}

func (s *Server) Stop() {
	for _, proxy := range s.pipes {
		proxy.Stop()
	}
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	s.sendSessions(conn)

	// Send full scrollback history so xterm renders the current screen immediately.
	// Uses -S - -E - for full history, -J to join wrapped lines, NO -e flag
	// (tmux's -e produces its own ANSI format that xterm.js can't parse).
	for _, inst := range s.agent.Instances() {
		content, err := tmux.CaptureFullHistory(inst.Session)
		if err == nil && content != "" {
			msg, _ := json.Marshal(serverMsg{
				Type:      "terminal-output",
				SessionID: inst.Session,
				Data:      content,
			})
			_ = conn.WriteMessage(websocket.TextMessage, msg)
		}
	}

	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg clientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		s.handleClientMsg(msg)
	}
}

func (s *Server) handleClientMsg(msg clientMsg) {
	switch msg.Type {
	case "terminal-attach":
		content, err := tmux.CaptureFullHistory(msg.SessionID)
		if err == nil && content != "" {
			s.broadcast(serverMsg{
				Type:      "terminal-output",
				SessionID: msg.SessionID,
				Data:      content,
			})
		}

	case "terminal-input":
		if proxy, ok := s.pipes[msg.SessionID]; ok && msg.Data != "" {
			_ = proxy.Write(msg.Data)
		}

	case "terminal-resize":
		if proxy, ok := s.pipes[msg.SessionID]; ok && msg.Cols > 0 && msg.Rows > 0 {
			proxy.Resize(msg.Cols, msg.Rows)
		}

	case "da-input":
		if msg.Text != "" {
			s.broadcast(serverMsg{Type: "da-message", Text: "已发送到所有 CC，等待执行..."})
			if errs := s.agent.HandleInput(msg.Text); len(errs) > 0 {
				for _, e := range errs {
					s.broadcast(serverMsg{Type: "da-message", Text: "[error] " + e.Error()})
				}
			}
		}
	}
}

// statusLoop periodically checks CC statuses and DA completion.
func (s *Server) statusLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		for _, inst := range s.agent.Instances() {
			inst.Refresh()
			s.broadcast(serverMsg{
				Type:      "cc-status",
				SessionID: inst.Session,
				Status:    inst.Status.String(),
			})
		}

		if result := s.agent.Tick(); result != "" {
			s.broadcast(serverMsg{Type: "da-message", Text: result})
		}
	}
}

func (s *Server) sendSessions(conn *websocket.Conn) {
	sessions := make([]ccSession, 0, len(s.agent.Instances()))
	for _, inst := range s.agent.Instances() {
		sessions = append(sessions, ccSession{
			ID:     inst.Session,
			Name:   inst.Name,
			Status: inst.Status.String(),
		})
	}
	data, _ := json.Marshal(serverMsg{Type: "sessions", Sessions: sessions})
	_ = conn.WriteMessage(websocket.TextMessage, data)
}

func (s *Server) broadcast(msg serverMsg) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for conn := range s.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			conn.Close()
			delete(s.clients, conn)
		}
	}
}
