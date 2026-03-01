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

  test('retries interactive focus preparation until external focus verifies', async () => {
    let focusAttemptCount = 0;
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        focusAttemptCount += 1;
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: focusAttemptCount >= 3,
          },
        };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(true);
    expect(preparation.failureReason).toBeNull();
    expect(preparation.overlayIgnoreEnabled).toBe(true);
    expect(preparation.overlayNonFocusableEnabled).toBe(true);
    expect(focusAttemptCount).toBe(3);
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
      ignore: true,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE, {
      focusable: false,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 180,
      skipDemotion: true,
    });
    const invokeCalls = (IpcBridge.invoke as jest.Mock).mock.calls;
    const firstIgnoreCallIndex = invokeCalls.findIndex(
      ([channel]: unknown[]) => channel === INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
    );
    const firstFocusCallIndex = invokeCalls.findIndex(
      ([channel]: unknown[]) => channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS,
    );
    expect(firstIgnoreCallIndex).toBeLessThan(firstFocusCallIndex);

    await restoreToolExecutionSurface(preparation);
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
      ignore: false,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE, {
      focusable: true,
    });
  });

  test('fails interactive surface prep after exhausting focus verification retries', async () => {
    let focusAttemptCount = 0;
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        focusAttemptCount += 1;
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: false,
          },
        };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(false);
    expect(preparation.failureReason).toBe('external_window_focus_not_verified');
    expect(focusAttemptCount).toBe(5);
  });

  test('restores overlay interaction toggles when interactive focus prep exhausts retries', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: false,
          },
        };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-no-click-through-on-failure',
      focusMaxAttempts: 2,
    });
    expect(preparation.canExecute).toBe(false);
    expect(preparation.overlayIgnoreEnabled).toBe(true);
    expect(preparation.overlayNonFocusableEnabled).toBe(true);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toContainEqual([
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: true },
    ]);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toContainEqual([
      INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE,
      { focusable: false },
    ]);

    await restoreToolExecutionSurface(preparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toContainEqual([
      INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE,
      { ignore: false },
    ]);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toContainEqual([
      INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE,
      { focusable: true },
    ]);
  });

  test('recovers from failed interactive prep on the next attempt', async () => {
    let focusAttemptCount = 0;
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        focusAttemptCount += 1;
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: focusAttemptCount >= 3,
          },
        };
      }
      return { success: true };
    });

    const first = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-recovery-first',
      focusMaxAttempts: 2,
    });
    expect(first.canExecute).toBe(false);
    expect(first.overlayIgnoreEnabled).toBe(true);
    expect(first.overlayNonFocusableEnabled).toBe(true);
    await restoreToolExecutionSurface(first);

    const second = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-recovery-second',
      focusMaxAttempts: 2,
    });
    expect(second.canExecute).toBe(true);
    expect(second.overlayIgnoreEnabled).toBe(true);
    expect(second.overlayNonFocusableEnabled).toBe(true);
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
      ignore: true,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE, {
      focusable: false,
    });

    await restoreToolExecutionSurface(second);
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
      ignore: false,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.SET_OVERLAY_FOCUSABLE, {
      focusable: true,
    });
  });

  test('allows interactive execution when external focus verification is unavailable', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        return {
          success: true,
          data: {
            canVerifyExternalFocus: false,
            externalFocusActive: false,
          },
        };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('interactive');
    expect(preparation.canExecute).toBe(true);
    expect(preparation.failureReason).toBeNull();
  });

  test('logs correlation-id retries and terminal failure transitions for interactive prep exhaustion', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS) {
        return {
          success: true,
          data: {
            canVerifyExternalFocus: true,
            externalFocusActive: false,
          },
        };
      }
      return { success: true };
    });

    const preparation = await prepareToolExecutionSurface('interactive', {
      correlationId: 'corr-focus-retry',
      focusMaxAttempts: 2,
    });

    expect(preparation.canExecute).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'corr-focus-retry',
        attempt: 1,
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'corr-focus-retry',
        phase_after: 'failed_terminal',
        reason: 'external_window_focus_not_verified',
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
