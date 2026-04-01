const {
  centerWindowOnDisplayWorkArea,
  fitWindowToDisplayWorkArea,
} = require('./display_affinity_runtime.cjs');
const {
  createOffscreenBounds,
  getWindowBounds,
  isWindowMinimized,
  rememberWindowBoundsForScreenshotSuppression,
  restoreWindowBoundsFromScreenshotSuppression,
  setWindowBounds,
  setWindowOpacityIfSupported,
  waitForMainWindowSuppressedForScreenshot,
} = require('./window_suppression_runtime.cjs');
const {
  activateWindowForInteraction: activateWindowForInteractionRuntime,
} = require('./window_platform_policy.cjs');
const {
  resolveChatWindowResponseOverlayRestore,
} = require('./response_overlay_visibility_policy.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

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
    syncChatboxHitTestState = () => {},
    syncWakewordToggleForChatVisibility = () => {},
    externalFocusTracker,
    getResponseOverlayPhase = () => null,
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
  syncChatboxHitTestState();
  // Non-focusing chatbox restores (tool/capture lifecycle) should not resurrect
  // stale response overlays before renderer awaiting state is ready.
  const {
    shouldRestoreResponse,
    shouldPrimeFallbackBounds,
  } = resolveChatWindowResponseOverlayRestore({
    focus,
    restoreResponseOverlay,
    responseOverlayVisible,
    isResponseOverlayStreamingPhase,
  });
  if (responseWindow && !responseWindow.isDestroyed() && shouldRestoreResponse) {
    if (shouldPrimeFallbackBounds) {
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
  logChatPillMainTrace({
    source: 'window-visibility',
    action: 'show-chat-window',
    phase: getResponseOverlayPhase(),
    chatWindowVisible: safeWindowVisible(chatWindow),
    responseWindowVisible: responseIsVisible,
    responseOverlayVisibleFlag: responseOverlayVisible,
    focus,
    restoreResponseOverlay,
  }, deps);
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
    getResponseOverlayPhase = () => null,
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
  logChatPillMainTrace({
    source: 'window-visibility',
    action: 'hide-chat-window',
    phase: getResponseOverlayPhase(),
    chatWindowVisible: safeWindowVisible(chatWindow),
    responseWindowVisible: safeWindowVisible(responseWindow),
    responseOverlayVisibleFlag: false,
  }, deps);
  return { success: true };
}

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
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
    responseWindow,
    contextLabelWindow,
    syncWindowDisplayAffinity = () => {},
    setActiveDisplayAffinity = () => {},
    getActiveDisplayAffinity = () => null,
    hideChatWindow = () => {},
    activateWindowForInteraction = activateWindowForInteractionRuntime,
  } = deps;
  const focus = options?.focus !== false;
  const maximize = options?.maximize === true;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  const overlaySurfaceVisible = (
    safeWindowVisible(chatWindow)
    || safeWindowVisible(responseWindow)
    || safeWindowVisible(contextLabelWindow)
  );
  if (overlaySurfaceVisible) {
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
    activateWindowForInteraction(mainWindow);
  }
  return { success: true };
}

module.exports = {
  hideMainWindow,
  hideChatWindow,
  showChatWindow,
  showMainWindow,
};
