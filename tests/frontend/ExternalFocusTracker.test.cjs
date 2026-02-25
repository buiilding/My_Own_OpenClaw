/** @jest-environment node */

const {
  createExternalFocusTracker,
  isAppWindowTitle,
} = require('../../frontend/src/main/external_focus_tracker.cjs');

describe('external_focus_tracker', () => {
  test('isAppWindowTitle matches marker case-insensitively', () => {
    expect(isAppWindowTitle('WindieOS Overlay', ['windieos'])).toBe(true);
    expect(isAppWindowTitle('Desktop Assistant', ['desktop assistant'])).toBe(true);
    expect(isAppWindowTitle('Visual Studio Code', ['windieos'])).toBe(false);
  });

  test('capture no-ops when no active window is available', () => {
    const warn = jest.fn();
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn().mockReturnValue(null),
        getWindows: jest.fn().mockReturnValue([]),
      },
      appWindowTitleMarkers: ['windieos'],
      warn,
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  test('capture ignores app-owned titles', () => {
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn().mockReturnValue({
          id: 1,
          getTitle: jest.fn().mockReturnValue('WindieOS'),
        }),
        getWindows: jest.fn().mockReturnValue([
          {
            id: 1,
            getTitle: jest.fn().mockReturnValue('WindieOS'),
            bringToTop: jest.fn(),
          },
        ]),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });

    tracker.capturePreviousExternalFocusedWindow();

    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
  });

  test('restore brings window to top by captured id', () => {
    const bringToTop = jest.fn();
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn().mockReturnValue({
          id: 77,
          getTitle: jest.fn().mockReturnValue('Code'),
        }),
        getWindows: jest.fn().mockReturnValue([
          { id: 77, bringToTop },
        ]),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(true);
    expect(bringToTop).toHaveBeenCalledTimes(1);
  });

  test('restore falls back to title when id not found', () => {
    const bringToTop = jest.fn();
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn().mockReturnValue({
          id: 88,
          getTitle: jest.fn().mockReturnValue('Visual Studio Code'),
        }),
        getWindows: jest.fn().mockReturnValue([
          { id: 12, getTitle: jest.fn().mockReturnValue('Visual Studio Code'), bringToTop },
        ]),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(true);
    expect(bringToTop).toHaveBeenCalledTimes(1);
  });

  test('restore returns false and warns on manager failure', () => {
    const warn = jest.fn();
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getWindows: jest.fn(() => {
          throw new Error('boom');
        }),
      },
      appWindowTitleMarkers: ['windieos'],
      warn,
    });

    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
    expect(warn).toHaveBeenCalledWith('[Main] Failed to restore external focused window:', 'boom');
  });

  test('capture and restore no-op outside win32', () => {
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'linux',
      windowManager: {},
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
  });
});
