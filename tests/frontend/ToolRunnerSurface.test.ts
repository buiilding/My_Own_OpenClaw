import {
  prepareToolExecutionSurface,
  restoreToolExecutionSurface,
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  shouldSkipToolExecution,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerSurface';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

describe('toolRunnerSurface helpers', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
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
    expect(
      resolveToolRequestIdForCancellation({ request_id: '   ', correlation_id: 'corr-2' }),
    ).toBe('corr-2');
    expect(
      resolveToolRequestIdForCancellation({ request_id: '   ', correlation_id: '   ' }),
    ).toBeNull();
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
    ).toBe('none');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'screenshot' } }]),
    ).toBe('none');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'switch_tab' } }]),
    ).toBe('none');
    expect(
      resolveBundleSurfaceMode([{ toolName: 'browser', args: { action: 'switch' } }]),
    ).toBe('none');
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
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
    ]);
  });

  test('collapses and restores chat pill for screenshot mode when dashboard is open', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('screenshot');
    expect(preparation.canExecute).toBe(true);
    await restoreToolExecutionSurface(preparation);

    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    expect(invokeCalls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('does not restore chat pill early for overlapping screenshot surface tokens', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      return { success: true };
    });

    const first = await prepareToolExecutionSurface('screenshot');
    const second = await prepareToolExecutionSurface('screenshot');

    await restoreToolExecutionSurface(first);
    expect(IpcBridge.invoke).toHaveBeenCalledTimes(2);

    await restoreToolExecutionSurface(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('keeps interactive surface prep policy-only and avoids direct overlay toggles', async () => {
    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(true);
    expect(preparation.failureReason).toBeNull();
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);

    await restoreToolExecutionSurface(preparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
  });

  test('keeps interactive surface prep executable even without external focus verification', async () => {
    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(true);
    expect(preparation.failureReason).toBeNull();
  });

  test('restores no renderer-side toggles after interactive execution completes', async () => {
    const preparation = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-interactive-complete',
    });
    expect(preparation.canExecute).toBe(true);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);

    await restoreToolExecutionSurface(preparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
  });

  test('keeps overlapping interactive tokens free of renderer-side overlay IPC', async () => {
    const first = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-overlap-first',
    });
    const second = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-overlap-second',
    });
    expect(second.canExecute).toBe(true);

    await restoreToolExecutionSurface(first);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);

    await restoreToolExecutionSurface(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
  });

  test('does not invoke focus preparation IPC for interactive execution', async () => {
    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(true);
    expect(preparation.failureReason).toBeNull();
    expect((IpcBridge.invoke as jest.Mock).mock.calls.some(
      ([channel]: unknown[]) => channel === 'prepare-overlay-tool-focus',
    )).toBe(false);
  });

  test('logs ready transitions for interactive prep without retry metadata', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const preparation = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-interactive-ready',
    });

    expect(preparation.canExecute).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'corr-interactive-ready',
        phase_after: 'preparing_interactive_focus',
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'corr-interactive-ready',
        phase_after: 'interactive_ready',
      }),
    );

    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = previousNodeEnv;
  });

  test('suppresses surface transition logs in production mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await prepareToolExecutionSurface('none', { correlationId: 'corr-prod' });

    expect(consoleLogSpy).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = previousNodeEnv;
  });
});
