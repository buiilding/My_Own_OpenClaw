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

function setWindowBounds(targetWindow, bounds) {
  if (!targetWindow || typeof targetWindow.setBounds !== 'function') {
    return false;
  }
  targetWindow.setBounds(bounds, false);
  return true;
}

function createOffscreenBounds(bounds) {
  if (!bounds) {
    return null;
  }
  return {
    ...bounds,
    x: -50000 - Math.max(0, bounds.width || 0),
    y: -50000 - Math.max(0, bounds.height || 0),
  };
}

function isWindowOffscreenForScreenshot(targetWindow) {
  const bounds = getWindowBounds(targetWindow);
  if (!bounds) {
    return false;
  }
  return (
    bounds.x + Math.max(0, bounds.width || 0) < -1000
    || bounds.y + Math.max(0, bounds.height || 0) < -1000
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
  if (!targetWindow || targetWindow.__windieScreenshotRestoreBounds) {
    return;
  }
  const bounds = getWindowBounds(targetWindow);
  if (bounds) {
    targetWindow.__windieScreenshotRestoreBounds = bounds;
  }
}

function restoreWindowBoundsFromScreenshotSuppression(targetWindow) {
  const bounds = targetWindow?.__windieScreenshotRestoreBounds || null;
  if (!bounds) {
    return false;
  }
  delete targetWindow.__windieScreenshotRestoreBounds;
  return setWindowBounds(targetWindow, bounds);
}

module.exports = {
  createOffscreenBounds,
  getWindowBounds,
  isWindowMinimized,
  rememberWindowBoundsForScreenshotSuppression,
  restoreWindowBoundsFromScreenshotSuppression,
  setWindowBounds,
  setWindowOpacityIfSupported,
  waitForMainWindowSuppressedForScreenshot,
};
