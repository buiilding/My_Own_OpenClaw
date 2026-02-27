import {
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  resolveToolSurfaceMode,
  shouldSkipToolExecution,
} from '../../frontend/src/renderer/features/chat/utils/toolRunnerSurface';

describe('toolRunnerSurface helpers', () => {
  test('resolves skip execution metadata flag', () => {
    expect(shouldSkipToolExecution(undefined)).toBe(false);
    expect(shouldSkipToolExecution({ skip_frontend_execution: false })).toBe(false);
    expect(shouldSkipToolExecution({ skip_frontend_execution: true })).toBe(true);
  });

  test('resolves cancellation request id with request_id precedence', () => {
    expect(resolveToolRequestIdForCancellation(undefined)).toBeNull();
    expect(resolveToolRequestIdForCancellation({ correlation_id: 'corr-1' })).toBe('corr-1');
    expect(
      resolveToolRequestIdForCancellation({ request_id: 'req-1', correlation_id: 'corr-1' }),
    ).toBe('req-1');
  });

  test('resolves tool surface mode for direct tool names', () => {
    expect(resolveToolSurfaceMode('read_file', {})).toBe('none');
    expect(resolveToolSurfaceMode('mouse_control', { action: 'click' })).toBe('interactive');
    expect(resolveToolSurfaceMode('screenshot', {})).toBe('screenshot');
    expect(resolveToolSurfaceMode('switch_tab', {})).toBe('none');
  });

  test('resolves browser action tool surface mode', () => {
    expect(resolveToolSurfaceMode('browser', { action: 'click' })).toBe('interactive');
    expect(resolveToolSurfaceMode('browser', { action: 'screenshot' })).toBe('screenshot');
    expect(resolveToolSurfaceMode('browser', { action: 'switch_tab' })).toBe('none');
    expect(resolveToolSurfaceMode('browser', { action: 'unknown' })).toBe('none');
  });

  test('resolves bundle mode with interactive precedence over screenshot', () => {
    expect(
      resolveBundleSurfaceMode([
        { toolName: 'read_file', args: {} },
        { toolName: 'screenshot', args: {} },
      ]),
    ).toBe('screenshot');

    expect(
      resolveBundleSurfaceMode([
        { toolName: 'screenshot', args: {} },
        { toolName: 'browser', args: { action: 'click' } },
      ]),
    ).toBe('interactive');
  });
});

