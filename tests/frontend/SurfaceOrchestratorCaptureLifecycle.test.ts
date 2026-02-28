import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  __resetSurfaceOrchestratorStateForTests,
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  restoreScreenshotCaptureVisibility,
} from '../../frontend/src/renderer/infrastructure/services/SurfaceOrchestrator';

describe('surfaceOrchestrator capture lifecycle', () => {
  beforeEach(() => {
    __resetSurfaceOrchestratorStateForTests();
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reuses overlap capture preparation and restores chat pill only after final release', async () => {
    const first = await prepareScreenshotCaptureVisibility({ captureId: 'capture-1' });
    const second = await prepareScreenshotCaptureVisibility({ captureId: 'capture-2' });

    expect(first.prepared).toBe(true);
    expect(second.prepared).toBe(true);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
      [INVOKE_CHANNELS.HIDE_CHATBOX],
    ]);

    await restoreScreenshotCaptureVisibility(first);
    expect(IpcBridge.invoke).toHaveBeenCalledTimes(2);

    await restoreScreenshotCaptureVisibility(second);
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
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

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        source: 'system-capture',
        correlation_id: 'capture-restore-1',
        phase_after: 'restoring_surface',
      }),
    );

    consoleLogSpy.mockRestore();
  });

  test('logs terminal transition when capture focus preparation invoke fails', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (IpcBridge.invoke as jest.Mock).mockRejectedValueOnce(new Error('focus failed'));

    await prepareExternalFocusForCapture({ captureId: 'capture-focus-1' });

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[SurfaceOrchestrator] transition',
      expect.objectContaining({
        correlation_id: 'capture-focus-1',
        phase_after: 'failed_terminal',
        reason: 'capture_focus_prepare_failed',
      }),
    );

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });
});
