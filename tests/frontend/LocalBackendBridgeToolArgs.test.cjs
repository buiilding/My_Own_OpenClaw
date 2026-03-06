/** @jest-environment node */

const {
  resolveToolArgs,
} = require('../../frontend/src/main/local_backend_bridge_tool_args.cjs');

describe('local_backend_bridge_tool_args', () => {
  test('sets native sudo auth mode for run_shell_command when full sudo is enabled', () => {
    const baseArgs = { command: 'sudo apt update', run_in_background: false };
    const result = resolveToolArgs(
      'run_shell_command',
      baseArgs,
      () => ({ agent_full_sudo_enabled: true }),
    );

    expect(result).toEqual({
      command: 'sudo apt update',
      run_in_background: false,
      sudo_auth_mode: 'native',
    });
    expect(baseArgs).toEqual({ command: 'sudo apt update', run_in_background: false });
  });

  test('sets os_prompt sudo auth mode for run_shell_command when full sudo is disabled', () => {
    const result = resolveToolArgs(
      'run_shell_command',
      { command: 'sudo apt update' },
      () => ({ agent_full_sudo_enabled: false }),
    );

    expect(result).toEqual({
      command: 'sudo apt update',
      sudo_auth_mode: 'os_prompt',
    });
  });

  test('falls back to os_prompt and warns when frontend config read fails', () => {
    const warn = jest.fn();

    const result = resolveToolArgs(
      'run_shell_command',
      { command: 'id' },
      () => {
        throw new Error('boom');
      },
      warn,
    );

    expect(result).toEqual({
      command: 'id',
      sudo_auth_mode: 'os_prompt',
    });
    expect(warn).toHaveBeenCalledWith(
      '[LocalBackend] Failed to read frontend config for sudo auth mode: boom',
    );
  });

  test('returns cloned plain args for non shell tools', () => {
    const baseArgs = { file_path: '/tmp/a' };
    const result = resolveToolArgs('read_file', baseArgs, null);

    expect(result).toEqual({ file_path: '/tmp/a' });
    expect(result).not.toBe(baseArgs);
  });

  test('returns empty object for non-object args', () => {
    expect(resolveToolArgs('read_file', null, null)).toEqual({});
    expect(resolveToolArgs('read_file', ['x'], null)).toEqual({});
  });

  test('run_shell_command normalizes non-object args to sudo_auth_mode payload', () => {
    const result = resolveToolArgs(
      'run_shell_command',
      null,
      () => ({ agent_full_sudo_enabled: true }),
    );

    expect(result).toEqual({
      sudo_auth_mode: 'native',
    });
  });

  test('passes through computer_use envelope unchanged for sidecar execution', () => {
    const args = {
      tool: 'mouse_control',
      metadata: {
        description: 'screen',
        explanation: 'click target',
        expectation: 'dialog opens',
      },
      arguments: { action: 'click', x: 10, y: 20 },
    };

    const result = resolveToolArgs('computer_use', args, null);

    expect(result).toEqual(args);
    expect(result).not.toBe(args);
  });

  test('keeps legacy nested arguments.metadata wrapper unchanged for computer_use payloads', () => {
    const args = {
      tool: 'mouse_control',
      arguments: {
        metadata: {
          description: 'screen',
          explanation: 'click target',
          expectation: 'dialog opens',
        },
        action: 'click',
        x: 10,
        y: 20,
      },
    };

    const result = resolveToolArgs('computer_use', args, null);

    expect(result).toEqual(args);
    expect(result).not.toBe(args);
    expect(result.metadata).toBeUndefined();
    expect(result.arguments.metadata).toEqual({
      description: 'screen',
      explanation: 'click target',
      expectation: 'dialog opens',
    });
  });

  test('does not synthesize missing top-level metadata for computer_use payloads', () => {
    const args = {
      tool: 'mouse_control',
      arguments: { action: 'click', x: 1, y: 2 },
    };

    const result = resolveToolArgs('computer_use', args, null);

    expect(result).toEqual(args);
    expect(result).not.toBe(args);
    expect(Object.prototype.hasOwnProperty.call(result, 'metadata')).toBe(false);
  });

  test('preserves malformed computer_use envelope for sidecar-owned validation', () => {
    const args = {
      tool: 'mouse_control_typo',
      metadata: {
        description: 'screen',
        explanation: 'click target',
        expectation: 'dialog opens',
      },
      arguments: 'not-a-dict',
    };

    const result = resolveToolArgs('computer_use', args, null);

    expect(result).toEqual(args);
    expect(result).not.toBe(args);
    expect(result.tool).toBe('mouse_control_typo');
    expect(result.arguments).toBe('not-a-dict');
  });
});
