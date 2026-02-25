function isAppWindowTitle(title, markers = []) {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return markers.some((marker) => normalized.includes(marker));
}

function createExternalFocusTracker({
  getPlatform = () => process.platform,
  windowManager,
  appWindowTitleMarkers = [],
  warn = console.warn,
} = {}) {
  let lastExternalFocusedWindowId = null;
  let lastExternalFocusedWindowTitle = null;

  function capturePreviousExternalFocusedWindow() {
    if (getPlatform() !== 'win32' || !windowManager || typeof windowManager.getActiveWindow !== 'function') {
      return;
    }
    try {
      const activeWindow = windowManager.getActiveWindow();
      if (!activeWindow) {
        return;
      }
      const activeTitle = typeof activeWindow.getTitle === 'function'
        ? activeWindow.getTitle()
        : '';
      if (!activeTitle || isAppWindowTitle(activeTitle, appWindowTitleMarkers)) {
        return;
      }
      if (typeof activeWindow.id === 'number') {
        lastExternalFocusedWindowId = activeWindow.id;
      }
      lastExternalFocusedWindowTitle = activeTitle;
    } catch (error) {
      warn('[Main] Failed to snapshot external focused window:', error?.message || error);
    }
  }

  function restorePreviousExternalFocusedWindow() {
    if (getPlatform() !== 'win32' || !windowManager || typeof windowManager.getWindows !== 'function') {
      return false;
    }
    try {
      const windows = windowManager.getWindows();
      if (!Array.isArray(windows) || windows.length === 0) {
        return false;
      }
      let target = null;
      if (typeof lastExternalFocusedWindowId === 'number') {
        target = windows.find((win) => win && win.id === lastExternalFocusedWindowId) || null;
      }
      if (!target && lastExternalFocusedWindowTitle) {
        target = windows.find((win) => (
          win
          && typeof win.getTitle === 'function'
          && win.getTitle() === lastExternalFocusedWindowTitle
        )) || null;
      }
      if (!target || typeof target.bringToTop !== 'function') {
        return false;
      }
      target.bringToTop();
      return true;
    } catch (error) {
      warn('[Main] Failed to restore external focused window:', error?.message || error);
      return false;
    }
  }

  return {
    capturePreviousExternalFocusedWindow,
    restorePreviousExternalFocusedWindow,
  };
}

module.exports = {
  createExternalFocusTracker,
};
