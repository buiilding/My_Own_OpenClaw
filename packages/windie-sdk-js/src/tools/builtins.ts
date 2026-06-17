/**
 * Provides the builtins module for the TypeScript SDK runtime.
 */

export type AgentBuiltinToolSet =
  | 'desktop'
  | 'filesystem'
  | 'shell'
  | 'browser'
  | 'computer';

export type AgentBuiltinSelection = 'none' | 'default' | AgentBuiltinToolSet[];

export type AgentBuiltinToolSelection = {
  builtins: AgentBuiltinSelection;
};

export const agentBuiltins = {
  none(): AgentBuiltinToolSelection {
    return {
      builtins: 'none',
    };
  },
  default(): AgentBuiltinToolSelection {
    return {
      builtins: 'default',
    };
  },
  desktop(): AgentBuiltinToolSelection {
    return {
      builtins: 'default',
    };
  },
  filesystem(): AgentBuiltinToolSelection {
    return {
      builtins: ['filesystem'],
    };
  },
  shell(): AgentBuiltinToolSelection {
    return {
      builtins: ['shell'],
    };
  },
  browser(): AgentBuiltinToolSelection {
    return {
      builtins: ['browser'],
    };
  },
  computer(): AgentBuiltinToolSelection {
    return {
      builtins: ['computer'],
    };
  },
};

const BUILTIN_PREFIXES: Record<AgentBuiltinToolSet, string[]> = {
  desktop: [],
  filesystem: ['read_file', 'replace', 'list_files', 'search_files'],
  shell: ['run_shell_command', 'run_command', 'shell', 'process'],
  browser: ['browser', 'open_url', 'click', 'type'],
  computer: [
    'computer',
    'mouse_control',
    'keyboard_control',
    'screenshot',
    'scroll',
    'switch_window',
    'wait',
    'get_open_windows',
  ],
};

export function shouldIncludeBuiltinTool(toolName: string, selected: AgentBuiltinToolSet[] = []): boolean {
  if (selected.length === 0) {
    return false;
  }
  if (selected.includes('desktop')) {
    return true;
  }
  const normalizedName = toolName.trim().toLowerCase();
  return selected.some(setName => BUILTIN_PREFIXES[setName].some(prefix => (
    normalizedName === prefix || normalizedName.startsWith(`${prefix}_`)
  )));
}
