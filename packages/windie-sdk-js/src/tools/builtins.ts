export type WindieBuiltinToolSet =
  | 'desktop'
  | 'filesystem'
  | 'shell'
  | 'browser'
  | 'browser-use'
  | 'computer'
  | 'computer-use'
  | 'memory';

export type WindieBuiltinSelection = 'none' | 'default' | WindieBuiltinToolSet[];

export type WindieBuiltinToolSelection = {
  builtins: WindieBuiltinSelection;
  /**
   * @deprecated Use builtins instead.
   */
  builtinTools?: WindieBuiltinToolSet[];
};

export const windieBuiltins = {
  none(): WindieBuiltinToolSelection {
    return {
      builtins: 'none',
    };
  },
  default(): WindieBuiltinToolSelection {
    return {
      builtins: 'default',
    };
  },
  desktop(): WindieBuiltinToolSelection {
    return {
      builtins: 'default',
    };
  },
  filesystem(): WindieBuiltinToolSelection {
    return {
      builtins: ['filesystem'],
    };
  },
  shell(): WindieBuiltinToolSelection {
    return {
      builtins: ['shell'],
    };
  },
  browser(): WindieBuiltinToolSelection {
    return {
      builtins: ['browser'],
    };
  },
  computer(): WindieBuiltinToolSelection {
    return {
      builtins: ['computer'],
    };
  },
  memory(): WindieBuiltinToolSelection {
    return {
      builtins: ['memory'],
    };
  },
};

const BUILTIN_PREFIXES: Record<WindieBuiltinToolSet, string[]> = {
  desktop: [],
  filesystem: ['read_file', 'replace', 'list_files', 'search_files'],
  shell: ['run_shell_command', 'run_command', 'shell'],
  browser: ['browser', 'open_url', 'click', 'type'],
  'browser-use': ['browser', 'open_url', 'click', 'type'],
  computer: ['computer', 'screenshot', 'click', 'type', 'scroll'],
  'computer-use': ['computer', 'screenshot', 'click', 'type', 'scroll'],
  memory: ['memory', 'search_memory', 'store_memory'],
};

export function shouldIncludeBuiltinTool(toolName: string, selected: WindieBuiltinToolSet[] = []): boolean {
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
