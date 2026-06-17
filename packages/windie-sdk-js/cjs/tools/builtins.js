"use strict";
/**
 * Provides the builtins module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentBuiltins = void 0;
exports.shouldIncludeBuiltinTool = shouldIncludeBuiltinTool;
exports.agentBuiltins = {
    none() {
        return {
            builtins: 'none',
        };
    },
    default() {
        return {
            builtins: 'default',
        };
    },
    desktop() {
        return {
            builtins: 'default',
        };
    },
    filesystem() {
        return {
            builtins: ['filesystem'],
        };
    },
    shell() {
        return {
            builtins: ['shell'],
        };
    },
    browser() {
        return {
            builtins: ['browser'],
        };
    },
    computer() {
        return {
            builtins: ['computer'],
        };
    },
};
const BUILTIN_PREFIXES = {
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
function shouldIncludeBuiltinTool(toolName, selected = []) {
    if (selected.length === 0) {
        return false;
    }
    if (selected.includes('desktop')) {
        return true;
    }
    const normalizedName = toolName.trim().toLowerCase();
    return selected.some(setName => BUILTIN_PREFIXES[setName].some(prefix => (normalizedName === prefix || normalizedName.startsWith(`${prefix}_`))));
}
