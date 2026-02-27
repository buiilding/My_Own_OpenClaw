/** @jest-environment node */

const {
  createExternalFocusTracker,
} = require('../../frontend/src/main/external_focus_tracker.cjs');

describe('external_focus_tracker', () => {
  function createTracker({
    activeWindow = null,
    windows = [],
    markers = ['windieos'],
    warn = jest.fn(),
  } = {}) {
    return createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn().mockReturnValue(activeWindow),
        getWindows: jest.fn().mockReturnValue(windows),
      },
      appWindowTitleMarkers: markers,
      warn,
    });
  }

  test('capture no-ops when no active window is available', () => {
    const warn = jest.fn();
    const tracker = createTracker({ warn });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  test('capture ignores app-owned titles case-insensitively', () => {
    const tracker = createTracker({
      activeWindow: {
        id: 1,
        getTitle: jest.fn().mockReturnValue('WindieOS Overlay'),
      },
      windows: [
        {
          id: 1,
          getTitle: jest.fn().mockReturnValue('WindieOS Overlay'),
          bringToTop: jest.fn(),
        },
      ],
      markers: ['desktop assistant', 'windieos'],
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
  });

  test('restore brings window to top by captured id', () => {
    const bringToTop = jest.fn();
    const tracker = createTracker({
      activeWindow: {
        id: 77,
        getTitle: jest.fn().mockReturnValue('Code'),
      },
      windows: [{ id: 77, bringToTop }],
    });

    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(true);
    expect(bringToTop).toHaveBeenCalledTimes(1);
    expect(tracker.isPreviousExternalFocusedWindowActive()).toBe(true);
  });

  test('restore falls back to title when id not found', () => {
    const bringToTop = jest.fn();
    const tracker = createTracker({
      activeWindow: {
        id: 88,
        getTitle: jest.fn().mockReturnValue('Visual Studio Code'),
      },
      windows: [
        { id: 12, getTitle: jest.fn().mockReturnValue('Visual Studio Code'), bringToTop },
      ],
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
        getActiveWindow: jest.fn(),
        getWindows: jest.fn(() => {
          throw new Error('boom');
        }),
      },
      appWindowTitleMarkers: ['windieos'],
      warn,
    });

    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
    expect(warn.mock.calls.length).toBeGreaterThan(0);
    expect(warn.mock.calls[0][0]).toBe('[Main] Failed to restore external focused window:');
    expect(String(warn.mock.calls[0][1])).toContain('boom');
  });

  test('capture and restore no-op outside win32', () => {
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'linux',
      windowManager: {},
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });

    expect(tracker.canTrackExternalFocus()).toBe(false);
    tracker.capturePreviousExternalFocusedWindow();
    expect(tracker.restorePreviousExternalFocusedWindow()).toBe(false);
    expect(tracker.isPreviousExternalFocusedWindowActive()).toBe(false);
  });

  test('reports capability only when platform and manager APIs support tracking', () => {
    const unsupportedTracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getWindows: jest.fn(),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });
    expect(unsupportedTracker.canTrackExternalFocus()).toBe(false);

    const supportedTracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn(),
        getWindows: jest.fn(),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });
    expect(supportedTracker.canTrackExternalFocus()).toBe(true);
  });

  test('active-window verification returns false when active window does not match captured', () => {
    const activeWindowRef = {
      current: {
        id: 10,
        getTitle: jest.fn().mockReturnValue('Code'),
      },
    };
    const tracker = createExternalFocusTracker({
      getPlatform: () => 'win32',
      windowManager: {
        getActiveWindow: jest.fn(() => activeWindowRef.current),
        getWindows: jest.fn().mockReturnValue([
          { id: 10, bringToTop: jest.fn() },
        ]),
      },
      appWindowTitleMarkers: ['windieos'],
      warn: jest.fn(),
    });
    tracker.capturePreviousExternalFocusedWindow();
    activeWindowRef.current = {
      id: 11,
      getTitle: jest.fn().mockReturnValue('Different'),
    };

    expect(tracker.isPreviousExternalFocusedWindowActive()).toBe(false);
  });
});
