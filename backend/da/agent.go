package da

import (
	"fmt"

	"github.com/user/vibe-curlaude/cc"
	"github.com/user/vibe-curlaude/tmux"
)

type State int

const (
	StateIdle    State = iota
	StateWaiting       // sent prompt, waiting for all CCs to finish
)

type DelegateAgent struct {
	instances []*cc.Instance
	state     State
}

func New(instances ...*cc.Instance) *DelegateAgent {
	return &DelegateAgent{
		instances: instances,
		state:     StateIdle,
	}
}

func (d *DelegateAgent) Instances() []*cc.Instance {
	return d.instances
}

func (d *DelegateAgent) State() State {
	return d.state
}

// HandleInput sends the user's raw text to every CC instance.
// MVP: pure passthrough, no LLM reasoning.
func (d *DelegateAgent) HandleInput(input string) []error {
	var errs []error
	for _, inst := range d.instances {
		if err := tmux.SendKeys(inst.Session, input); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", inst.Name, err))
		}
	}
	d.state = StateWaiting
	return errs
}

// Tick refreshes all CC statuses and returns a message if all are idle.
// Called periodically by the TUI tick loop.
func (d *DelegateAgent) Tick() string {
	if d.state != StateWaiting {
		return ""
	}

	allIdle := true
	var summary string
	for _, inst := range d.instances {
		inst.Refresh()
		if !inst.Status.IsIdle() {
			allIdle = false
		}
	}

	if allIdle {
		d.state = StateIdle
		summary = "done — 所有 CC 执行完毕"
		for _, inst := range d.instances {
			summary += fmt.Sprintf("\n  %s: %s", inst.Name, inst.Status)
		}
	}
	return summary
}
