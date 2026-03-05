package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/user/vibe-curlaude/cc"
	"github.com/user/vibe-curlaude/da"
	"github.com/user/vibe-curlaude/tmux"
	"github.com/user/vibe-curlaude/tui"
	"github.com/user/vibe-curlaude/ws"
)

const startupTimeout = 60 * time.Second

func main() {
	webMode := flag.Bool("web", false, "start WebSocket server for web frontend instead of TUI")
	wsPort := flag.Int("port", 8765, "WebSocket server port (web mode only)")
	flag.Parse()

	workDir, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot get working directory: %v\n", err)
		os.Exit(1)
	}

	cc1 := cc.New("CC #1", cc.SessionPrefix+"cc-1")
	cc2 := cc.New("CC #2", cc.SessionPrefix+"cc-2")
	instances := []*cc.Instance{cc1, cc2}

	cleanup := func() {
		for _, inst := range instances {
			_ = inst.Stop()
		}
	}
	defer cleanup()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cleanup()
		os.Exit(0)
	}()

	tmux.EnsureServer()

	for _, inst := range instances {
		_ = tmux.KillSession(inst.Session)
	}

	fmt.Println("Starting CC instances...")
	for _, inst := range instances {
		fmt.Printf("  %s (%s) in %s\n", inst.Name, inst.Session, workDir)
		if err := inst.Start(workDir); err != nil {
			fmt.Fprintf(os.Stderr, "failed to start %s: %v\n", inst.Name, err)
			os.Exit(1)
		}
	}

	fmt.Println("Waiting for CC instances to become ready...")
	for _, inst := range instances {
		if err := inst.WaitReady(startupTimeout); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
		fmt.Printf("  %s: ready\n", inst.Name)
	}

	agent := da.New(instances...)

	if *webMode {
		fmt.Printf("Starting WebSocket server on :%d ...\n", *wsPort)
		fmt.Println("Open your browser and start the frontend with: cd frontend && npm run dev")
		server := ws.NewServer(agent, *wsPort)
		if err := server.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "WS server error: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Println("Launching TUI...")
		model := tui.NewModel(agent)
		p := tea.NewProgram(model, tea.WithAltScreen(), tea.WithMouseCellMotion())
		if _, err := p.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "TUI error: %v\n", err)
			os.Exit(1)
		}
	}
}
