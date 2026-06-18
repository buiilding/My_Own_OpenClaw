/**
 * Coordinates the window suppression runtime for the Electron main process.
 */

const SCREENSHOT_RESTORE_BOUNDS_KEY = '__desktopRuntimeScreenshotRestoreBounds';

function setWindowOpacityIfSupported(targetWindow, opacity) {
  if (!targetWindow || typeof targetWindow.setOpacity !== 'function') {
    return;
  }
  targetWindow.setOpacity(opacity);
}

function isWindowVisible(targetWindow) {
  return Boolean(
    targetWindow
    && typeof targetWindow.isVisible === 'function'
    && targetWindow.isVisible()
  );
}

function isWindowMinimized(targetWindow) {
  return Boolean(
    targetWindow
    && typeof targetWindow.isMinimized === 'function'
    && targetWindow.isMinimized()
  );
}

function getWindowBounds(targetWindow) {
  if (!targetWindow || typeof targetWindow.getBounds !== 'function') {
    return null;
  }
  return targetWindow.getBounds();
}

function normalizeRoundedNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed);
  }
  const fallbackParsed = Number(fallback);
  return Number.isFinite(fallbackParsed) ? Math.round(fallbackParsed) : 0;
}

function normalizePositiveDimension(value, fallback = 0) {
  return Math.max(1, normalizeRoundedNumber(value, fallback || 1));
}

function normalizeWindowBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }
  return {
    x: normalizeRoundedNumber(bounds.x),
    y: normalizeRoundedNumber(bounds.y),
    width: normalizePositiveDimension(bounds.width),
    height: normalizePositiveDimension(bounds.height),
  };
}

function setWindowBounds(targetWindow, bounds) {
  if (!targetWindow || typeof targetWindow.setBounds !== 'function') {
    return false;
  }
  const normalizedBounds = normalizeWindowBounds(bounds);
  if (!normalizedBounds) {
    return false;
  }
  targetWindow.setBounds(normalizedBounds, false);
  return true;
}

function createOffscreenBounds(bounds) {
  const normalizedBounds = normalizeWindowBounds(bounds);
  if (!normalizedBounds) {
    return null;
  }
  return {
    ...normalizedBounds,
    x: -50000 - normalizedBounds.width,
    y: -50000 - normalizedBounds.height,
  };
}

function isWindowOffscreenForScreenshot(targetWindow) {
  const bounds = normalizeWindowBounds(getWindowBounds(targetWindow));
  if (!bounds) {
    return false;
  }
  return (
    bounds.x + bounds.width < -1000
    || bounds.y + bounds.height < -1000
  );
}

function isMainWindowSuppressedForScreenshot(targetWindow) {
  return (
    isWindowMinimized(targetWindow)
    || !isWindowVisible(targetWindow)
    || isWindowOffscreenForScreenshot(targetWindow)
  );
}

async function waitForMainWindowSuppressedForScreenshot(
  targetWindow,
  {
    waitInMain = (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs)),
    timeoutMs = 1200,
    pollMs = 16,
  } = {},
) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() <= deadline) {
    if (isMainWindowSuppressedForScreenshot(targetWindow)) {
      return true;
    }
    await waitInMain(pollMs);
  }
  return isMainWindowSuppressedForScreenshot(targetWindow);
}

function rememberWindowBoundsForScreenshotSuppression(targetWindow) {
  if (!targetWindow || targetWindow[SCREENSHOT_RESTORE_BOUNDS_KEY]) {
    return;
  }
  const bounds = getWindowBounds(targetWindow);
  const normalizedBounds = normalizeWindowBounds(bounds);
  if (normalizedBounds) {
    targetWindow[SCREENSHOT_RESTORE_BOUNDS_KEY] = normalizedBounds;
  }
}

function restoreWindowBoundsFromScreenshotSuppression(targetWindow) {
  const bounds = targetWindow?.[SCREENSHOT_RESTORE_BOUNDS_KEY] || null;
  if (!bounds) {
    return false;
  }
  delete targetWindow[SCREENSHOT_RESTORE_BOUNDS_KEY];
  return setWindowBounds(targetWindow, bounds);
}

module.exports = {
  createOffscreenBounds,
  getWindowBounds,
  isWindowMinimized,
  rememberWindowBoundsForScreenshotSuppression,
  restoreWindowBoundsFromScreenshotSuppression,
  SCREENSHOT_RESTORE_BOUNDS_KEY,
  setWindowBounds,
  setWindowOpacityIfSupported,
  waitForMainWindowSuppressedForScreenshot,
};
