import { useState } from 'react'
import type { TeamMemberConfig } from '../stores/team-state-store'

interface InlineTeamCreatorProps {
  onSubmit: (name: string, members: TeamMemberConfig[], defaultProjectPath: string) => void
  onCancel: () => void
}

export function InlineTeamCreator({ onSubmit, onCancel }: InlineTeamCreatorProps) {
  const [name, setName] = useState('')
  const [projectPath, setProjectPath] = useState('~')
  const [members, setMembers] = useState<TeamMemberConfig[]>([
    { role: 'cc', agentType: 'claude', name: 'agent-1' },
  ])

  const addMember = () => {
    setMembers([
      ...members,
      { role: 'cc', agentType: 'claude', name: `agent-${members.length + 1}` },
    ])
  }

  const removeMember = (index: number) => {
    if (members.length <= 1) return
    setMembers(members.filter((_, i) => i !== index))
  }

  const updateMember = (index: number, updates: Partial<TeamMemberConfig>) => {
    setMembers(members.map((m, i) => (i === index ? { ...m, ...updates } : m)))
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onSubmit(name.trim(), members, projectPath)
  }

  return (
    <div data-testid="inline-team-creator" className="px-3 py-2 border-b border-white/10 bg-white/[0.02] space-y-2">
      <input
        data-testid="team-name-input"
        aria-label="Team name"
        type="text"
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
        autoFocus
      />

      <input
        data-testid="team-project-path-input"
        aria-label="Project path"
        type="text"
        placeholder="Project path"
        value={projectPath}
        onChange={(e) => setProjectPath(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
      />

      <div data-testid="team-members-section" className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40 uppercase">Members</span>
          <button
            data-testid="team-add-member-button"
            aria-label="Add team member"
            onClick={addMember}
            className="text-[10px] text-blue-400 hover:text-blue-300"
          >
            + Add
          </button>
        </div>
        {members.map((member, i) => (
          <div key={i} data-testid={`team-member-row-${i}`} className="flex gap-1 items-center">
            <select
              data-testid={`team-member-type-${i}`}
              aria-label={`Agent type for member ${i + 1}`}
              value={member.agentType}
              onChange={(e) => updateMember(i, { agentType: e.target.value as any })}
              className="px-1 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded text-white focus:outline-none"
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="claude-rp">Claude-RP</option>
              <option value="pi">Pi</option>
            </select>
            <input
              data-testid={`team-member-name-${i}`}
              aria-label={`Name for member ${i + 1}`}
              type="text"
              value={member.name}
              onChange={(e) => updateMember(i, { name: e.target.value })}
              className="flex-1 px-1 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded text-white focus:outline-none"
            />
            {members.length > 1 && (
              <button
                data-testid={`team-remove-member-${i}`}
                aria-label={`Remove member ${i + 1}`}
                onClick={() => removeMember(i)}
                className="text-red-400/50 hover:text-red-400 text-[10px]"
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-1 pt-1">
        <button
          data-testid="team-create-submit"
          aria-label="Create team"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 px-2 py-1 text-[10px] rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white"
        >
          Create
        </button>
        <button
          data-testid="team-create-cancel"
          aria-label="Cancel team creation"
          onClick={onCancel}
          className="px-2 py-1 text-[10px] rounded bg-white/5 hover:bg-white/10 text-white/50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
