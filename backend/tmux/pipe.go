package tmux

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

// PipePaneProxy streams raw terminal output from a tmux pane via pipe-pane + tail.
// Adapted from agentboard's PipePaneTerminalProxy.
type PipePaneProxy struct {
	session  string
	pipeFile string
	pipeDir  string
	tail     *exec.Cmd
	onData   func(data string)
	stopCh   chan struct{}
	mu       sync.Mutex
	running  bool
}

func NewPipePaneProxy(session string, onData func(string)) *PipePaneProxy {
	pipeDir := filepath.Join(os.TempDir(), "vibe-curlaude-pipes")
	return &PipePaneProxy{
		session: session,
		pipeDir: pipeDir,
		onData:  onData,
		stopCh:  make(chan struct{}),
	}
}

// Start sets up pipe-pane and starts tailing the output file.
func (p *PipePaneProxy) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.running {
		return nil
	}

	if err := os.MkdirAll(p.pipeDir, 0700); err != nil {
		return fmt.Errorf("mkdir pipe dir: %w", err)
	}

	p.pipeFile = filepath.Join(p.pipeDir, p.session+".pipe")
	if err := os.WriteFile(p.pipeFile, nil, 0600); err != nil {
		return fmt.Errorf("create pipe file: %w", err)
	}

	// Send current screen via callback so xterm gets an initial render.
	// No -e flag: tmux's -e produces its own ANSI format that xterm can't parse.
	initContent, err := CaptureFullHistory(p.session)
	if err == nil && initContent != "" {
		p.onData(initContent)
	}

	// Start pipe-pane: tmux pipes all NEW raw output from the pane into our file
	if err := run("pipe-pane", "-t", p.session, fmt.Sprintf("cat >> %s", p.pipeFile)); err != nil {
		return fmt.Errorf("pipe-pane: %w", err)
	}

	// Start tail -f to stream the file
	p.tail = exec.Command("tail", "-n", "+1", "-F", p.pipeFile)
	stdout, err := p.tail.StdoutPipe()
	if err != nil {
		return fmt.Errorf("tail stdout pipe: %w", err)
	}

	if err := p.tail.Start(); err != nil {
		return fmt.Errorf("tail start: %w", err)
	}

	p.running = true

	go func() {
		buf := make([]byte, 16*1024)
		for {
			select {
			case <-p.stopCh:
				return
			default:
			}
			n, err := stdout.Read(buf)
			if n > 0 {
				p.onData(string(buf[:n]))
			}
			if err != nil {
				return
			}
		}
	}()

	return nil
}

// Write sends input to the tmux pane (like typing).
func (p *PipePaneProxy) Write(data string) error {
	if data == "" {
		return nil
	}
	return SendSpecialKey(p.session, data)
}

// Resize changes the tmux pane dimensions.
func (p *PipePaneProxy) Resize(cols, rows int) {
	if cols <= 0 || rows <= 0 {
		return
	}
	_ = run("resize-pane", "-t", p.session, "-x", fmt.Sprint(cols), "-y", fmt.Sprint(rows))
}

// Stop tears down the pipe-pane and tail process.
func (p *PipePaneProxy) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.running {
		return
	}
	p.running = false

	close(p.stopCh)

	// Stop pipe-pane (passing no command disables it)
	_ = run("pipe-pane", "-t", p.session)

	if p.tail != nil && p.tail.Process != nil {
		_ = p.tail.Process.Kill()
		_ = p.tail.Wait()
	}

	_ = os.Remove(p.pipeFile)
}
