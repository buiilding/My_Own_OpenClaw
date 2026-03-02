import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  prepareToolExecutionSurface,
  restoreScreenshotCaptureVisibility,
  restoreToolExecutionSurface,
} from '../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator';

describe('surfaceOrchestrator capture lifecycle', () => {
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

  test('reuses overlap capture preparation and restores chat pill only after final release', async () => {
    const first = await prepareScreenshotCaptureVisibility({ captureId: 'capture-1' });
    const second = await prepareScreenshotCaptureVisibility({ captureId: 'capture-2' });

    expect(first.prepared).toBe(true);
    expect(second.prepared).toBe(true);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
    ]);

    await restoreScreenshotCaptureVisibility(first);
    expect(IpcBridge.invoke).toHaveBeenCalledTimes(1);

    await restoreScreenshotCaptureVisibility(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('restores chat pill at capture-level when nested inside screenshot surface token', async () => {
    (IpcBridge.invoke as jest.Mock).mockImplementation(async (channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
        return { success: true, data: { visible: true } };
      }
      return { success: true };
    });

    const toolPreparation = await prepareToolExecutionSurface('screenshot');
    const capturePreparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-nested' });

    expect(capturePreparation.restoreChatPillAfterCapture).toBe(false);

    await restoreScreenshotCaptureVisibility(capturePreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);

    await restoreToolExecutionSurface(toolPreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('hides and restores chat pill for capture nested inside interactive surface token', async () => {
    const toolPreparation = await prepareToolExecutionSurface('interactive');
    const capturePreparation = await prepareScreenshotCaptureVisibility({ captureId: 'capture-interactive-nested' });

    expect(capturePreparation.restoreChatPillAfterCapture).toBe(true);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
    ]);

    await restoreScreenshotCaptureVisibility(capturePreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);

    await restoreToolExecutionSurface(toolPreparation);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('normalizes restore context defaults for source and fallback correlation id', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await prepareScreenshotCaptureVisibility({ captureId: 'capture-prep' });

    await restoreScreenshotCaptureVisibility({
      prepared: true,
      captureId: '   ',
    });

    const hasRestoreLog = consoleLogSpy.mock.calls.some(([label, payload]) => (
      label === '[SurfaceOrchestrator] transition'
      && payload?.source === 'system-capture'
      && typeof payload?.correlation_id === 'string'
      && payload.correlation_id.startsWith('capture-restore-')
      && payload?.phase_after === 'restoring_surface'
    ));
    expect(hasRestoreLog).toBe(true);

    consoleLogSpy.mockRestore();
  });

  test('logs no-op transition for capture focus preparation', async () => {
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
      restoreChatPillAfterCapture: false,
    });

    await restoreScreenshotCaptureVisibility(preparation);
    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });
});
