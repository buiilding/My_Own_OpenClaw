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
});
