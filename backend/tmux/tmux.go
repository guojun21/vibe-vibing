package tmux

import (
	"fmt"
	"os/exec"
	"strings"
)

func findTmux() string {
	if p, err := exec.LookPath("tmux"); err == nil {
		return p
	}
	for _, p := range []string{"/usr/local/bin/tmux", "/opt/homebrew/bin/tmux", "/usr/bin/tmux"} {
		if _, err := exec.LookPath(p); err == nil {
			return p
		}
	}
	return "tmux"
}

func run(args ...string) error {
	cmd := exec.Command(findTmux(), args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmux %s: %w (%s)", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func output(args ...string) (string, error) {
	cmd := exec.Command(findTmux(), args...)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("tmux %s: %w", strings.Join(args, " "), err)
	}
	return string(out), nil
}

// EnsureServer makes sure a tmux server is running.
func EnsureServer() {
	_ = exec.Command(findTmux(), "start-server").Run()
}

// SessionExists checks if a tmux session with the given name exists (exact match).
func SessionExists(name string) bool {
	cmd := exec.Command(findTmux(), "has-session", fmt.Sprintf("-t=%s", name))
	return cmd.Run() == nil
}

// CreateSession starts a detached tmux session running the given program.
// Adapted from swarm's start_session: uses zsh -c with PATH setup so that
// ~/.claude/local binaries (claude CLI) are found.
func CreateSession(name, dir, program string) error {
	if SessionExists(name) {
		return fmt.Errorf("tmux session %q already exists", name)
	}

	shellCmd := fmt.Sprintf(
		`export PATH="$HOME/.claude/local:$HOME/.local/bin:$PATH"; exec %s`,
		program,
	)

	err := run(
		"new-session", "-d",
		"-s", name,
		"-c", dir,
		"-x", "120", "-y", "40",
		"--", "zsh", "-c", shellCmd,
	)
	if err != nil {
		return fmt.Errorf("create session %q: %w", name, err)
	}

	_ = run("set-option", "-t", name, "history-limit", "10000")
	return nil
}

// SendKeys sends text literally to the session then presses Enter.
// Uses -l (literal) to avoid interpreting special characters in the text.
// Adapted from swarm's send_keys.
func SendKeys(session, text string) error {
	if err := run("send-keys", "-l", "-t", session, text); err != nil {
		return err
	}
	return run("send-keys", "-t", session, "Enter")
}

// SendSpecialKey sends a raw tmux key (e.g. "y", "n", "Escape", "BTab", "C-c").
func SendSpecialKey(session, key string) error {
	return run("send-keys", "-t", session, key)
}

// CapturePaneContent returns the current visible content with ANSI escapes preserved.
func CapturePaneContent(session string) (string, error) {
	return output("capture-pane", "-p", "-e", "-J", "-t", session)
}

// CapturePanePlain returns the current visible content as plain text (no ANSI escapes).
// Better for feeding into xterm.js which handles its own rendering.
func CapturePanePlain(session string) (string, error) {
	return output("capture-pane", "-p", "-J", "-t", session)
}

// CapturePaneHistory returns scrollback content from line start to end.
func CapturePaneHistory(session, start, end string) (string, error) {
	return output("capture-pane", "-p", "-J", "-S", start, "-E", end, "-t", session)
}

// CaptureFullHistory returns the complete scrollback buffer as plain text.
// Matches agentboard's captureTmuxHistory: -p -S - -E - -J, NO -e flag.
func CaptureFullHistory(session string) (string, error) {
	return output("capture-pane", "-p", "-S", "-", "-E", "-", "-J", "-t", session)
}

// KillSession destroys a tmux session.
func KillSession(session string) error {
	if !SessionExists(session) {
		return nil
	}
	return run("kill-session", "-t", session)
}
