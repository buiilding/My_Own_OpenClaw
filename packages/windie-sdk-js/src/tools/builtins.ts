export type WindieBuiltinToolSet = 'desktop' | 'filesystem' | 'shell' | 'browser' | 'computer' | 'memory';

export type WindieBuiltinToolSelection = {
  builtinTools: WindieBuiltinToolSet[];
};

export const windieBuiltins = {
  desktop(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['desktop'],
    };
  },
  filesystem(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['filesystem'],
    };
  },
  shell(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['shell'],
    };
  },
  browser(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['browser'],
    };
  },
  computer(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['computer'],
    };
  },
  memory(): WindieBuiltinToolSelection {
    return {
      builtinTools: ['memory'],
    };
  },
};

const BUILTIN_PREFIXES: Record<WindieBuiltinToolSet, string[]> = {
  desktop: [],
  filesystem: ['read_file', 'replace', 'list_files', 'search_files'],
  shell: ['run_shell_command', 'run_command', 'shell'],
  browser: ['browser', 'open_url', 'click', 'type'],
  computer: ['computer', 'screenshot', 'click', 'type', 'scroll'],
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
