/** @jest-environment node */

const {
  createOffscreenBounds,
  rememberWindowBoundsForScreenshotSuppression,
  restoreWindowBoundsFromScreenshotSuppression,
  setWindowBounds,
  setWindowOpacityIfSupported,
  waitForMainWindowSuppressedForScreenshot,
} = require('../../src/main/surfaces/window_suppression_runtime.cjs');

function createWindow({
  visible = true,
  minimized = false,
  bounds = { x: 100, y: 100, width: 600, height: 400 },
} = {}) {
  return {
    isVisible: jest.fn(() => visible),
    isMinimized: jest.fn(() => minimized),
    getBounds: jest.fn(() => bounds),
    setBounds: jest.fn(),
    setOpacity: jest.fn(),
  };
}

describe('window_suppression_runtime', () => {
  test('creates offscreen bounds far outside the visible desktop', () => {
    expect(createOffscreenBounds({ x: 100, y: 100, width: 600, height: 400 })).toEqual({
      x: -50600,
      y: -50400,
      width: 600,
      height: 400,
    });
  });

  test('normalizes malformed bounds before creating offscreen screenshot bounds', () => {
    expect(createOffscreenBounds({
      x: Infinity,
      y: Number.NaN,
      width: Infinity,
      height: Number.NaN,
    })).toEqual({
      x: -50001,
      y: -50001,
      width: 1,
      height: 1,
    });
  });

  test('treats offscreen bounds as suppressed during wait polling', async () => {
    const offscreenWindow = createWindow({
      bounds: { x: -50600, y: -50400, width: 600, height: 400 },
    });

    await expect(
      waitForMainWindowSuppressedForScreenshot(offscreenWindow, { timeoutMs: 0 }),
    ).resolves.toBe(true);
  });

  test('does not consider onscreen visible windows suppressed', async () => {
    const window = createWindow();
    await expect(
      waitForMainWindowSuppressedForScreenshot(window, { timeoutMs: 0 }),
    ).resolves.toBe(false);
  });

  test('waits until the window becomes suppressed', async () => {
    const window = createWindow();
    window.isVisible
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const waitInMain = jest.fn().mockResolvedValue(undefined);

    await expect(
      waitForMainWindowSuppressedForScreenshot(window, { waitInMain, timeoutMs: 100, pollMs: 5 }),
    ).resolves.toBe(true);
    expect(waitInMain).toHaveBeenCalled();
  });

  test('remembers and restores screenshot suppression bounds', () => {
    const window = createWindow();

    rememberWindowBoundsForScreenshotSuppression(window);
    expect(window.__desktopRuntimeScreenshotRestoreBounds).toEqual({
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    });

    expect(restoreWindowBoundsFromScreenshotSuppression(window)).toBe(true);
    expect(window.setBounds).toHaveBeenCalledWith({
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    }, false);
    expect(window.__desktopRuntimeScreenshotRestoreBounds).toBeUndefined();
  });

  test('normalizes remembered screenshot suppression bounds before restore', () => {
    const window = createWindow({
      bounds: {
        x: Infinity,
        y: Number.NaN,
        width: Infinity,
        height: -10,
      },
    });

    rememberWindowBoundsForScreenshotSuppression(window);
    expect(window.__desktopRuntimeScreenshotRestoreBounds).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });

    expect(restoreWindowBoundsFromScreenshotSuppression(window)).toBe(true);
    expect(window.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }, false);
  });

  test('applies window opacity only when supported', () => {
    const window = createWindow();
    setWindowOpacityIfSupported(window, 0.25);
    expect(window.setOpacity).toHaveBeenCalledWith(0.25);

    expect(() => setWindowOpacityIfSupported({}, 0.5)).not.toThrow();
  });

  test('returns false when setBounds is unsupported', () => {
    expect(setWindowBounds({}, { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
  });

  test('returns false when setBounds receives an invalid bounds object', () => {
    const window = createWindow();

    expect(setWindowBounds(window, null)).toBe(false);
    expect(window.setBounds).not.toHaveBeenCalled();
  });
});
