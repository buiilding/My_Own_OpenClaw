import {
  __resetToolExecutionSurfaceStateForTests,
  prepareToolExecutionSurface,
  restoreToolExecutionSurface,
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  shouldSkipToolExecution,
} from '../../frontend/src/renderer/features/chat/utils/toolRunnerSurface';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

describe('toolRunnerSurface helpers', () => {
  beforeEach(() => {
    __resetToolExecutionSurfaceStateForTests();
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  test('resolves surface mode semantics through bundle mode resolver', () => {
    expect(
      resolveBundleSurfaceMode([{ toolName: 'read_file', args: {} }]),
    ).toBe('none');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'mouse_control', args: { action: 'click' } }]),
    ).toBe('interactive');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'screenshot', args: {} }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'switch_tab', args: {} }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'wait', args: { seconds: 2 } }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'click' } }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'screenshot' } }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'switch_tab' } }]),
    ).toBe('screenshot');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'switch' } }]),
    ).toBe('screenshot');
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
    ).toBe('screenshot');
  });

  test('runs collapse/restore around switch_tab tool surface preparation', async () => {
    const preparation = await prepareToolExecutionSurface('screenshot');
    expect(preparation.canExecute).toBe(true);
    await restoreToolExecutionSurface(preparation);

    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('does not restore chat pill early for overlapping surface tokens', async () => {
    const first = await prepareToolExecutionSurface('screenshot');
    const second = await prepareToolExecutionSurface('screenshot');

    await restoreToolExecutionSurface(first);
    expect(IpcBridge.invoke).toHaveBeenCalledTimes(2);

    await restoreToolExecutionSurface(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });
});
