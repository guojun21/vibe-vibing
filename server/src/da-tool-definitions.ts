import type { ToolDefinition } from './thalamus-client'

export const DA_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'send_to_cc',
      description:
        'Send an instruction to a specific CC (Claude Code) instance. ' +
        'The CC will execute it as a coding prompt. Use this to assign individual tasks to specific workers.',
      parameters: {
        type: 'object',
        properties: {
          cc_name: {
            type: 'string',
            description: 'Name of the CC instance to send the instruction to',
          },
          instruction: {
            type: 'string',
            description: 'The coding instruction/prompt to send to this CC instance',
          },
        },
        required: ['cc_name', 'instruction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_cc_output',
      description:
        'Read the TUI output of a specific CC instance. Returns the terminal output text. ' +
        'Use this to check what a CC has done, see its results, errors, or current state.',
      parameters: {
        type: 'object',
        properties: {
          cc_name: {
            type: 'string',
            description: 'Name of the CC instance to read output from',
          },
          tail_lines: {
            type: 'number',
            description: 'Number of lines to read from the end. Defaults to 50.',
          },
        },
        required: ['cc_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_cc_status',
      description:
        'Get the current status of all CC instances in the team. ' +
        'Returns each CC name and its status (idle, processing, completed, permission, unknown).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_idle',
      description:
        'Wait until a specific CC instance becomes idle (finished its current task). ' +
        'Blocks until the CC is idle or timeout is reached. Use this after sending an instruction to wait for completion.',
      parameters: {
        type: 'object',
        properties: {
          cc_name: {
            type: 'string',
            description: 'Name of the CC instance to wait for',
          },
          timeout_seconds: {
            type: 'number',
            description: 'Maximum seconds to wait. Defaults to 120.',
          },
        },
        required: ['cc_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'broadcast',
      description:
        'Send the same instruction to ALL CC instances simultaneously. ' +
        'Use this when all workers should execute the same command.',
      parameters: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'The instruction to send to all CC instances',
          },
        },
        required: ['instruction'],
      },
    },
  },
]
