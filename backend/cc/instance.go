package cc

import (
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/user/vibe-curlaude/tmux"
)

const SessionPrefix = "vc-"

type Instance struct {
	Name        string // display name: "CC #1"
	Session     string // tmux session name: "vc-cc-1"
	Status      Status
	Content     string   // last captured pane content
	contentHash [32]byte // SHA256 for change detection
}

func New(name, session string) *Instance {
	return &Instance{
		Name:    name,
		Session: session,
		Status:  StatusUnknown,
	}
}

// Start creates the tmux session and launches claude TUI inside it.
func (c *Instance) Start(workDir string) error {
	return tmux.CreateSession(c.Session, workDir, "claude")
}

// WaitReady polls until CC shows the idle prompt or times out.
// Automatically dismisses the trust folder prompt if it appears.
func (c *Instance) WaitReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	trustHandled := false
	for time.Now().Before(deadline) {
		c.Refresh()

		if c.Status == StatusTrustPrompt && !trustHandled {
			// Press Enter to accept "Yes, I trust this folder"
			_ = tmux.SendSpecialKey(c.Session, "Enter")
			trustHandled = true
			time.Sleep(2 * time.Second)
			continue
		}

		if c.Status.IsIdle() {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("%s: timed out waiting for CC to become ready (last status: %s)", c.Name, c.Status)
}

// Refresh captures the pane and updates status.
func (c *Instance) Refresh() {
	content, err := tmux.CapturePaneContent(c.Session)
	if err != nil {
		c.Status = StatusUnknown
		return
	}
	c.Content = content
	c.contentHash = sha256.Sum256([]byte(content))
	c.Status = DetectStatus(content)
}

// HasChanged returns true if pane content differs from the last known hash.
func (c *Instance) HasChanged() bool {
	content, err := tmux.CapturePaneContent(c.Session)
	if err != nil {
		return false
	}
	newHash := sha256.Sum256([]byte(content))
	changed := newHash != c.contentHash
	c.contentHash = newHash
	c.Content = content
	c.Status = DetectStatus(content)
	return changed
}

// Stop kills the underlying tmux session.
func (c *Instance) Stop() error {
	return tmux.KillSession(c.Session)
}
