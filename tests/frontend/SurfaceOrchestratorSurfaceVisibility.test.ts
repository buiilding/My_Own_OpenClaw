import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import * as surfaceVisibility from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/surfaceVisibility';

const {
  suppressSurfaceForBackgroundCapture,
  restoreSurfaceAfterBackgroundCapture,
  shouldManageSurfaceVisibilityForBackgroundCapture,
} = surfaceVisibility;

describe('surfaceOrchestrator surfaceVisibility', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true, hiddenSurface: 'chatbox' });
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

  test('suppresses the active surface with deterministic hide-only ordering', async () => {
    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({
      success: true,
      settleMs: 120,
      hiddenSurface: 'chatbox',
    });

    expect(shouldManageSurfaceVisibilityForBackgroundCapture()).toBe(true);

    await expect(suppressSurfaceForBackgroundCapture()).resolves.toEqual({
      collapsed: true,
      hiddenSurface: 'chatbox',
      timing: {
        waitTime: 0,
        hideInvokeTime: expect.any(Number),
        settleTime: 0.12,
      },
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);
  });

  test('restores the hidden surface as non-focusing show', async () => {
    await expect(restoreSurfaceAfterBackgroundCapture()).resolves.toEqual({
      restored: true,
      restoredSurface: 'chatbox',
      restoreInvokeTime: expect.any(Number),
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT, { hiddenSurface: 'chatbox' }],
    ]);
  });

  test('propagates collapse errors to caller for fail-closed handling', async () => {
    (IpcBridge.invoke as jest.Mock)
      .mockRejectedValueOnce(new Error('hide-failed'));

    await expect(suppressSurfaceForBackgroundCapture()).rejects.toThrow('hide-failed');
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);
  });

  test('uses a true no-op surface visibility runtime on Windows', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    expect(shouldManageSurfaceVisibilityForBackgroundCapture()).toBe(false);

    await expect(suppressSurfaceForBackgroundCapture()).resolves.toEqual({
      collapsed: false,
      hiddenSurface: 'none',
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
    });
    await expect(restoreSurfaceAfterBackgroundCapture()).resolves.toEqual({
      restored: false,
      restoredSurface: 'none',
      restoreInvokeTime: 0,
    });

    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });

  test('uses a true no-op surface visibility runtime on macOS', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    expect(shouldManageSurfaceVisibilityForBackgroundCapture()).toBe(false);

    await expect(suppressSurfaceForBackgroundCapture()).resolves.toEqual({
      collapsed: false,
      hiddenSurface: 'none',
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
    });
    await expect(restoreSurfaceAfterBackgroundCapture()).resolves.toEqual({
      restored: false,
      restoredSurface: 'none',
      restoreInvokeTime: 0,
    });

    expect(IpcBridge.invoke).not.toHaveBeenCalled();
  });
});
