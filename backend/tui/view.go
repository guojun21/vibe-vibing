package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("212"))

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("240"))

	statusBarStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Background(lipgloss.Color("236")).
			Padding(0, 1)

	daHeaderStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("86"))

	ccHeaderActive = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("214"))

	ccHeaderIdle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("242"))

	msgUserStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("117"))

	msgDAStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("156"))
)

func (m Model) View() string {
	if m.width == 0 {
		return "Initializing..."
	}

	leftWidth := m.width / 3
	rightWidth := m.width - leftWidth - 3 // 3 for border padding
	ccPanelHeight := (m.height - 4) / 2   // split right side in two, minus status bar

	left := m.renderLeftPanel(leftWidth, m.height-3)
	right := m.renderRightPanel(rightWidth, ccPanelHeight)

	main := lipgloss.JoinHorizontal(lipgloss.Top, left, right)
	bar := m.renderStatusBar()

	return lipgloss.JoinVertical(lipgloss.Left, main, bar)
}

func (m Model) renderLeftPanel(w, h int) string {
	header := daHeaderStyle.Render("DA (Delegate Agent)")

	var msgLines []string
	for _, msg := range m.messages {
		if strings.HasPrefix(msg, "You: ") {
			msgLines = append(msgLines, msgUserStyle.Render(msg))
		} else {
			msgLines = append(msgLines, msgDAStyle.Render(msg))
		}
	}
	msgs := strings.Join(msgLines, "\n")

	inputView := m.input.View()

	// Calculate available height for messages
	msgHeight := h - 5 // header + input + padding
	if msgHeight < 1 {
		msgHeight = 1
	}

	// Truncate messages from top if too many lines
	msgSplit := strings.Split(msgs, "\n")
	if len(msgSplit) > msgHeight {
		msgSplit = msgSplit[len(msgSplit)-msgHeight:]
	}
	msgs = strings.Join(msgSplit, "\n")

	content := fmt.Sprintf("%s\n\n%s\n\n%s", header, msgs, inputView)

	return borderStyle.
		Width(w).
		Height(h).
		Render(content)
}

func (m Model) renderRightPanel(w, panelH int) string {
	panels := make([]string, len(m.ccPanels))
	for i, content := range m.ccPanels {
		inst := m.da.Instances()[i]

		var headerStyle lipgloss.Style
		if inst.Status.IsIdle() {
			headerStyle = ccHeaderIdle
		} else {
			headerStyle = ccHeaderActive
		}
		header := headerStyle.Render(
			fmt.Sprintf("%s [%s]", inst.Name, inst.Status),
		)

		// Truncate content to fit panel height, show last N lines
		lines := strings.Split(content, "\n")
		maxLines := panelH - 3
		if maxLines < 1 {
			maxLines = 1
		}
		if len(lines) > maxLines {
			lines = lines[len(lines)-maxLines:]
		}
		truncated := strings.Join(lines, "\n")

		panel := fmt.Sprintf("%s\n%s", header, truncated)
		panels[i] = borderStyle.
			Width(w).
			Height(panelH).
			Render(panel)
	}

	return lipgloss.JoinVertical(lipgloss.Left, panels...)
}

func (m Model) renderStatusBar() string {
	daState := "idle"
	if m.da.State() != 0 {
		daState = "waiting"
	}

	ccStatuses := ""
	for _, inst := range m.da.Instances() {
		ccStatuses += fmt.Sprintf(" | %s: %s", inst.Name, inst.Status)
	}

	bar := fmt.Sprintf(
		" DA: %s%s | ctrl+c: quit",
		daState, ccStatuses,
	)

	return statusBarStyle.Width(m.width).Render(bar)
}
