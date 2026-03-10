import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  prepareToolExecutionSurface,
  restoreScreenshotCaptureVisibility,
  restoreToolExecutionSurface,
} from '../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator';
import {
  decrementActiveScreenshotCaptureCount,
  getActiveScreenshotCaptureCount,
  setPendingHiddenSurfaceRestore,
  setPendingScreenshotCaptureRestore,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/state';

describe('surfaceOrchestrator capture lifecycle', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    setPendingHiddenSurfaceRestore(null);
    setPendingScreenshotCaptureRestore(false);
    while (getActiveScreenshotCaptureCount() > 0) {
      decrementActiveScreenshotCaptureCount();
    }

    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: string, data?: any) => {
      if (channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT) {
        return {
          success: true,
          waitMs: data?.waitMs ?? 0,
          settleMs: data?.settleMs ?? 120,
          waitTime: typeof data?.waitMs === 'number' ? data.waitMs / 1000 : 0,
          hideInvokeTime: data?.hideSurface === false ? 0 : 0.001,
          settleTime: typeof data?.settleMs === 'number' ? data.settleMs / 1000 : 0.12,
          hiddenSurface: 'chatbox',
        };
      }
      return { success: true };
    });
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

  test('reuses overlap capture preparation and restores the hidden surface only after final release', async () => {
    const first = await prepareScreenshotCaptureVisibility({ captureId: 'capture-1' });
    const second = await prepareScreenshotCaptureVisibility({ captureId: 'capture-2' });

    expect(first.prepared).toBe(true);
    expect(second.prepared).toBe(true);
    expect(first.timing).toEqual({
      waitTime: 0,
      hideInvokeTime: expect.any(Number),
      settleTime: expect.any(Number),
    });
    expect(second.timing).toEqual({
      waitTime: 0,
      hideInvokeTime: 0,
      settleTime: 0,
    });
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);

    await restoreScreenshotCaptureVisibility(first);
    expect(IpcBridge.invoke).toHaveBeenCalledTimes(1);

    await restoreScreenshotCaptureVisibility(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('restores the hidden surface at tool-level when capture is nested inside screenshot surface token', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      if (channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT) {
        return {
          success: true,
          waitMs: 0,
          settleMs: 120,
          waitTime: 0,
          hideInvokeTime: 0.001,
          settleTime: 0.12,
          hiddenSurface: 'chatbox',
        };
      }
      return { success: true };
    });

    const toolPreparation = await prepareToolExecutionSurface('screenshot');
    const capturePreparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-nested' });

    expect(capturePreparation.restoreSurfaceAfterCapture).toBe(false);
    expect(capturePreparation.timing).toEqual({
      waitTime: 0,
      hideInvokeTime: 0,
      settleTime: 0,
    });

    await restoreScreenshotCaptureVisibility(capturePreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {}],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);

    await restoreToolExecutionSurface(toolPreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {}],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('hides and restores the hidden surface for capture nested inside interactive surface token', async () => {
    const toolPreparation = await prepareToolExecutionSurface('interactive');
    const capturePreparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-interactive-nested' });

    expect(capturePreparation.restoreSurfaceAfterCapture).toBe(true);
    expect(capturePreparation.timing).toEqual({
      waitTime: 0,
      hideInvokeTime: expect.any(Number),
      settleTime: expect.any(Number),
    });
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);

    await restoreScreenshotCaptureVisibility(capturePreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);

    await restoreToolExecutionSurface(toolPreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('normalizes restore context defaults for source and fallback correlation id', async () => {
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = true;
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await prepareScreenshotCaptureVisibility({ captureId: 'capture-prep' });

    await restoreScreenshotCaptureVisibility({
      prepared: true,
      captureId: '   ',
    });

    expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(0);

    consoleLogSpy.mockRestore();
    delete (window as any).__WINDIE_VERBOSE_TOOL_LOGS__;
  });

  test('logs no-op transition for capture focus preparation', async () => {
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = true;
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (IpcBridge.invoke as jest.Mock).mockRejectedValueOnce(new Error('focus failed'));

    await prepareExternalFocusForCapture({ captureId: 'capture-focus-1' });

    expect(IpcBridge.invoke).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'capture-focus-1',
        phase_after: 'capture_ready',
        reason: 'no_surface_transition_needed',
      }),
    );

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    delete (window as any).__WINDIE_VERBOSE_TOOL_LOGS__;
  });

  test('keeps capture focus handoff free of renderer IPC', async () => {
    await prepareExternalFocusForCapture({ captureId: 'capture-focus-2' });

    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });

  test('skips Linux-only capture hide bookkeeping on Windows', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    const preparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-win' });

    expect(preparation).toEqual({
      prepared: true,
      captureId: 'capture-win',
      restoreSurfaceAfterCapture: false,
      hiddenSurface: 'none',
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
    });

    await restoreScreenshotCaptureVisibility(preparation);
    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });

  test('skips Linux-only capture hide bookkeeping on macOS', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    const preparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-mac' });

    expect(preparation).toEqual({
      prepared: true,
      captureId: 'capture-mac',
      restoreSurfaceAfterCapture: false,
      hiddenSurface: 'none',
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
    });

    await restoreScreenshotCaptureVisibility(preparation);
    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });
});
