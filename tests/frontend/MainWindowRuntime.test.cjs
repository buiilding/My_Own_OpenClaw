/** @jest-environment node */

const {
  prepareOverlayQueryCaptureFocus,
} = require('../../frontend/src/main/main_window_runtime.cjs');

describe('main_window_runtime prepareOverlayQueryCaptureFocus', () => {
  function createFocusableWindow() {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      blur: jest.fn(),
    };
  }

  test('blurs assistant windows and verifies restored external focus before return', async () => {
    const chatWindow = createFocusableWindow();
    const mainWindow = createFocusableWindow();
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(true),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(true),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      chatWindow,
      mainWindow,
      externalFocusTracker,
      waitMs: 0,
    });

    expect(chatWindow.blur).toHaveBeenCalledTimes(1);
    expect(mainWindow.blur).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ restoredExternalFocus: true, externalFocusActive: true });
  });

  test('returns inactive verification result when restored app is not active', async () => {
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(true),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(false),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ restoredExternalFocus: true, externalFocusActive: false });
  });

  test('skips active-window verification when external focus cannot be restored', async () => {
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(false),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(true),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).not.toHaveBeenCalled();
    expect(result).toEqual({ restoredExternalFocus: false, externalFocusActive: false });
  });
});
