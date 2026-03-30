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

  test('returns deep-cloned nested args for non shell tools', () => {
    const baseArgs = {
      file_path: '/tmp/a',
      options: { offset: 1, limit: 10 },
    };
    const result = resolveToolArgs('read_file', baseArgs, null);

    result.options.offset = 99;

    expect(baseArgs.options.offset).toBe(1);
  });

  test('returns empty object for non-object args', () => {
    expect(resolveToolArgs('read_file', null, null)).toEqual({});
    expect(resolveToolArgs('read_file', ['x'], null)).toEqual({});
  });

  test('injects default display bounds for screenshot tools when args do not provide them', () => {
    const result = resolveToolArgs(
      'screenshot',
      { explanation: 'Capture current monitor' },
      null,
      console.warn,
      {
        displayBounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    );

    expect(result).toEqual({
      explanation: 'Capture current monitor',
      display_bounds: {
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
        monitor_id: '2',
        desktop_virtual_bounds: {
          x: 0,
          y: 0,
          width: 4480,
          height: 1440,
        },
      },
    });
  });

  test('preserves explicit screenshot display bounds over default affinity bounds', () => {
    const result = resolveToolArgs(
      'screenshot',
      {
        display_bounds: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          monitor_id: '1',
        },
      },
      null,
      console.warn,
      {
        displayBounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    );

    expect(result).toEqual({
      display_bounds: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        monitor_id: '1',
      },
    });
  });

  test('injects default display bounds into direct screenshot arguments', () => {
    const result = resolveToolArgs(
      'screenshot',
      {
        explanation: 'Capture only the active monitor',
      },
      null,
      console.warn,
      {
        displayBounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    );

    expect(result).toEqual({
      explanation: 'Capture only the active monitor',
      display_bounds: {
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
        monitor_id: '2',
        desktop_virtual_bounds: {
          x: 0,
          y: 0,
          width: 4480,
          height: 1440,
        },
      },
    });
  });

  test('preserves explicit screenshot display bounds for direct screenshot arguments', () => {
    const result = resolveToolArgs(
      'screenshot',
      {
        explanation: 'Capture only the active monitor',
        display_bounds: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          monitor_id: '1',
        },
      },
      null,
      console.warn,
      {
        displayBounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    );

    expect(result).toEqual({
      explanation: 'Capture only the active monitor',
      display_bounds: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        monitor_id: '1',
      },
    });
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

  test('injects native sudo auth mode into direct run_shell_command arguments', () => {
    const baseArgs = {
      command: 'sudo apt update',
      run_in_background: false,
      explanation: 'run privileged command',
    };

    const result = resolveToolArgs(
      'run_shell_command',
      baseArgs,
      () => ({ agent_full_sudo_enabled: true }),
    );

    expect(result).toEqual({
      command: 'sudo apt update',
      run_in_background: false,
      explanation: 'run privileged command',
      sudo_auth_mode: 'native',
    });
    expect(baseArgs).toEqual({
      command: 'sudo apt update',
      run_in_background: false,
      explanation: 'run privileged command',
    });
  });

  test('normalizes non-object direct run_shell_command args into sudo payload', () => {
    const result = resolveToolArgs(
      'run_shell_command',
      'not-an-object',
      () => ({ agent_full_sudo_enabled: true }),
    );

    expect(result).toEqual({
      sudo_auth_mode: 'native',
    });
  });
});
