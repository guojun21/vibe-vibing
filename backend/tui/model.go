package tui

import (
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/user/vibe-curlaude/da"
	"github.com/user/vibe-curlaude/tmux"
)

const tickInterval = 500 * time.Millisecond

type tickMsg struct{}

func tickCmd() tea.Cmd {
	return tea.Tick(tickInterval, func(time.Time) tea.Msg {
		return tickMsg{}
	})
}

type Model struct {
	da       *da.DelegateAgent
	input    textarea.Model
	messages []string
	ccPanels []string
	width    int
	height   int
	quitting bool
}

func NewModel(agent *da.DelegateAgent) Model {
	ta := textarea.New()
	ta.Placeholder = "输入要发送给所有 CC 的指令..."
	ta.Focus()
	ta.CharLimit = 2000
	ta.SetWidth(40)
	ta.SetHeight(2)
	ta.ShowLineNumbers = false

	panels := make([]string, len(agent.Instances()))
	for i := range panels {
		panels[i] = "(waiting for CC...)"
	}

	return Model{
		da:       agent,
		input:    ta,
		messages: []string{"DA: 准备就绪。输入文字后按 Enter 发送给所有 CC。"},
		ccPanels: panels,
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(textarea.Blink, tickCmd())
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.input.SetWidth(m.width/3 - 4)
		return m, nil

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			m.quitting = true
			return m, tea.Quit
		case tea.KeyEnter:
			text := m.input.Value()
			if text == "" {
				return m, nil
			}
			m.messages = append(m.messages, "You: "+text)
			if errs := m.da.HandleInput(text); len(errs) > 0 {
				for _, e := range errs {
					m.messages = append(m.messages, "DA [err]: "+e.Error())
				}
			} else {
				m.messages = append(m.messages, "DA: 已发送到所有 CC，等待执行...")
			}
			m.input.Reset()
			return m, nil
		}

	case tickMsg:
		// Refresh CC panel contents
		for i, inst := range m.da.Instances() {
			content, err := tmux.CapturePaneContent(inst.Session)
			if err == nil {
				m.ccPanels[i] = content
			}
		}
		// Check if all CCs are done
		if result := m.da.Tick(); result != "" {
			m.messages = append(m.messages, "DA: "+result)
		}
		cmds = append(cmds, tickCmd())
	}

	// Forward remaining key events to textarea
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}
