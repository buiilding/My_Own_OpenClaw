const {
  centerWindowOnDisplayWorkArea,
  fitWindowToDisplayWorkArea,
} = require('./display_affinity_runtime.cjs');

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

function resolveShowTargetDisplayAffinity({
  targetDisplayAffinity = null,
  targetWindow = null,
  getActiveDisplayAffinity = () => null,
}) {
  if (targetDisplayAffinity && typeof targetDisplayAffinity === 'object') {
    return targetDisplayAffinity;
  }
  if (
    !targetWindow
    || typeof targetWindow !== 'object'
    || (typeof targetWindow.isDestroyed === 'function' && targetWindow.isDestroyed())
    || (typeof targetWindow.isVisible === 'function' && targetWindow.isVisible())
  ) {
    return null;
  }
  return getActiveDisplayAffinity();
}

function showChatWindow(options = {}, deps = {}) {
  const {
    chatWindow,
    mainWindow,
    responseWindow,
    positionChatWindow = () => {},
    syncWindowDisplayAffinity = () => {},
    setActiveDisplayAffinity = () => {},
    getActiveDisplayAffinity = () => null,
    responseOverlayVisible,
    isResponseOverlayStreamingPhase = () => false,
    setResponseOverlayVisible = () => {},
    ensureChatWindowOnTop = () => {},
    ensureResponseOverlayFallbackBounds = () => {},
    showResponseWindowInactive = () => {},
    broadcastResponseOverlayVisibility = () => {},
    syncContextLabelWindowVisibility = () => {},
    syncWakewordToggleForChatVisibility = () => {},
    externalFocusTracker,
  } = deps;
  const focus = options?.focus !== false;
  const restoreResponseOverlay = options?.restoreResponseOverlay === true;
  const capturePreviousExternalFocus = (
    typeof externalFocusTracker?.capturePreviousExternalFocusedWindow === 'function'
      ? externalFocusTracker.capturePreviousExternalFocusedWindow.bind(externalFocusTracker)
      : null
  );

  if (!chatWindow || chatWindow.isDestroyed()) {
    return { success: false, reason: 'Chat window not available' };
  }
  // Capture external focus target even for non-focusing chatbox transitions.
  // Interactive tool-surface prep calls show-chatbox with focus=false and relies
  // on this snapshot for subsequent focus restoration/verification.
  if (capturePreviousExternalFocus) {
    capturePreviousExternalFocus();
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  const resolvedTargetDisplayAffinity = resolveShowTargetDisplayAffinity({
    targetDisplayAffinity: options?.targetDisplayAffinity,
    targetWindow: chatWindow,
    getActiveDisplayAffinity,
  });
  if (resolvedTargetDisplayAffinity) {
    setActiveDisplayAffinity(resolvedTargetDisplayAffinity);
    positionChatWindow();
  }
  if (!chatWindow.isVisible()) {
    if (!focus && typeof chatWindow.showInactive === 'function') {
      chatWindow.showInactive();
    } else {
      chatWindow.show();
    }
  }
  syncWindowDisplayAffinity(chatWindow);
  ensureChatWindowOnTop();
  // Non-focusing chatbox restores (tool/capture lifecycle) should not resurrect
  // stale response overlays before renderer awaiting state is ready.
  const shouldRestoreResponse = (
    (focus || restoreResponseOverlay)
    && (responseOverlayVisible || isResponseOverlayStreamingPhase())
  );
  if (responseWindow && !responseWindow.isDestroyed() && shouldRestoreResponse) {
    if (isResponseOverlayStreamingPhase()) {
      setResponseOverlayVisible(true);
      ensureResponseOverlayFallbackBounds();
    }
    showResponseWindowInactive();
  }
  const responseIsVisible = Boolean(
    responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible(),
  );
  broadcastResponseOverlayVisibility(responseIsVisible);
  syncContextLabelWindowVisibility();
  if (focus) {
    chatWindow.focus();
    chatWindow.webContents.send('chatbox-focus');
  }
  syncWakewordToggleForChatVisibility();
  return { success: true };
}

function hideChatWindow(deps = {}) {
  const {
    chatWindow,
    responseWindow,
    contextLabelWindow,
    broadcastResponseOverlayVisibility = () => {},
    syncWakewordToggleForChatVisibility = () => {},
  } = deps;

  if (!chatWindow || chatWindow.isDestroyed()) {
    return { success: false, reason: 'Chat window not available' };
  }
  if (chatWindow.isVisible()) {
    chatWindow.hide();
  }
  if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
    responseWindow.hide();
  }
  if (contextLabelWindow && !contextLabelWindow.isDestroyed() && contextLabelWindow.isVisible()) {
    contextLabelWindow.hide();
  }
  broadcastResponseOverlayVisibility(false);
  syncWakewordToggleForChatVisibility();
  return { success: true };
}

async function hideMainWindow(options = {}, deps = {}) {
  const {
    mainWindow,
    waitInMain,
  } = deps;
  const suppressForScreenshot = options?.suppressForScreenshot === true;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  if (mainWindow.isVisible()) {
    setWindowOpacityIfSupported(mainWindow, 0);
    if (suppressForScreenshot) {
      rememberWindowBoundsForScreenshotSuppression(mainWindow);
      const offscreenBounds = createOffscreenBounds(getWindowBounds(mainWindow));
      if (offscreenBounds) {
        setWindowBounds(mainWindow, offscreenBounds);
      }
    }
    mainWindow.hide();
  }
  const suppressedForScreenshot = suppressForScreenshot
    ? await waitForMainWindowSuppressedForScreenshot(mainWindow, { waitInMain })
    : !mainWindow.isVisible();
  return {
    success: true,
    suppressedForScreenshot,
    minimized: isWindowMinimized(mainWindow),
  };
}

function showMainWindow(options = {}, deps = {}) {
  const {
    mainWindow,
    chatWindow,
    syncWindowDisplayAffinity = () => {},
    setActiveDisplayAffinity = () => {},
    getActiveDisplayAffinity = () => null,
    hideChatWindow = () => {},
  } = deps;
  const focus = options?.focus !== false;
  const maximize = options?.maximize === true;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    hideChatWindow();
  }
  const resolvedTargetDisplayAffinity = resolveShowTargetDisplayAffinity({
    targetDisplayAffinity: options?.targetDisplayAffinity,
    targetWindow: mainWindow,
    getActiveDisplayAffinity,
  });
  if (resolvedTargetDisplayAffinity) {
    delete mainWindow.__windieScreenshotRestoreBounds;
    setActiveDisplayAffinity(resolvedTargetDisplayAffinity);
    if (typeof mainWindow.isMaximized === 'function' && mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    if (maximize) {
      fitWindowToDisplayWorkArea(mainWindow, resolvedTargetDisplayAffinity);
    } else {
      centerWindowOnDisplayWorkArea(mainWindow, resolvedTargetDisplayAffinity);
    }
  }
  if (isWindowMinimized(mainWindow) && typeof mainWindow.restore === 'function') {
    mainWindow.restore();
  }
  if (!resolvedTargetDisplayAffinity) {
    restoreWindowBoundsFromScreenshotSuppression(mainWindow);
  }
  setWindowOpacityIfSupported(mainWindow, 1);
  if (!mainWindow.isVisible()) {
    if (!focus && typeof mainWindow.showInactive === 'function') {
      mainWindow.showInactive();
    } else {
      mainWindow.show();
    }
  }
  syncWindowDisplayAffinity(mainWindow);
  if (maximize && !resolvedTargetDisplayAffinity) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  }
  if (focus) {
    mainWindow.focus();
  }
  return { success: true };
}

module.exports = {
  hideMainWindow,
  hideChatWindow,
  showChatWindow,
  showMainWindow,
};
