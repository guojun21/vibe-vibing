package cc

import (
	"regexp"
	"strings"
)

type Status int

const (
	StatusUnknown      Status = iota
	StatusIdle                // CC is waiting for input (> prompt visible)
	StatusProcessing          // CC is thinking / executing
	StatusCompleted           // CC finished a response and is idle
	StatusPermission          // CC is asking for permission (Allow/Deny)
	StatusTrustPrompt         // CC showing "trust this folder" on first launch
)

func (s Status) String() string {
	switch s {
	case StatusIdle:
		return "idle"
	case StatusProcessing:
		return "processing"
	case StatusCompleted:
		return "completed"
	case StatusPermission:
		return "permission"
	case StatusTrustPrompt:
		return "trust-prompt"
	default:
		return "unknown"
	}
}

func (s Status) IsIdle() bool {
	return s == StatusIdle || s == StatusCompleted
}

// ANSI escape stripper
var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

func stripANSI(s string) string {
	return ansiPattern.ReplaceAllString(s, "")
}

// Patterns translated from agent-conductor's claude_code.py and tmuxcc's parser.
var (
	// CC is actively working: spinner chars followed by "…"
	processingPattern = regexp.MustCompile(`[✶✢✽✻·✳⠿⠇⠋⠙⠸⠴⠦⠧⠖⠏⠹⠼⠷⠾⠽⠻].*…`)

	// CC finished a response block: ⏺ followed by whitespace
	responsePattern = regexp.MustCompile(`⏺\s`)

	// CC prompt ready for input: ❯ or > at start of line (CC uses ❯ as prompt)
	idlePromptPattern = regexp.MustCompile(`(?m)^[❯>]\s*$`)

	// "? for shortcuts" at bottom of CC TUI when idle
	shortcutsHint = "? for shortcuts"

	// CC asking user to pick an option (numbered list with ❯)
	waitingAnswerPattern = regexp.MustCompile(`❯\s*\d+\.`)

	// CC asking for permission
	permissionPattern = regexp.MustCompile(`(?i)(Allow|Do you want to|Yes.*No|\[y/n\]|\[Y/n\])`)

	// CC showing trust folder prompt on first launch
	trustPromptPattern = regexp.MustCompile(`(?i)(trust.*folder|trust this folder|I trust this)`)
)

// DetectStatus determines the current CC TUI state from captured pane content.
// Priority order matches agent-conductor: processing > waiting > permission > completed > idle.
func DetectStatus(content string) Status {
	if content == "" {
		return StatusUnknown
	}

	clean := stripANSI(content)

	if trustPromptPattern.MatchString(clean) {
		return StatusTrustPrompt
	}

	if processingPattern.MatchString(clean) {
		return StatusProcessing
	}

	// Numbered option selection (not the idle prompt)
	if waitingAnswerPattern.MatchString(clean) {
		return StatusProcessing
	}

	if permissionPattern.MatchString(clean) {
		return StatusPermission
	}

	hasIdlePrompt := idlePromptPattern.MatchString(clean) || strings.Contains(clean, shortcutsHint)
	hasResponse := responsePattern.MatchString(clean)

	if hasResponse && hasIdlePrompt {
		return StatusCompleted
	}

	if hasIdlePrompt {
		return StatusIdle
	}

	return StatusProcessing
}
