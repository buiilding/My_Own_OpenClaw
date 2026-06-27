/** @jest-environment node */

const {
  resolveToolArgs,
} = require('../../src/main/sidecar/local_runtime_tool_args.cjs');

describe('local_runtime_tool_args', () => {
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

});
