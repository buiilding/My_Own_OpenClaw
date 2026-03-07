const {
  centerWindowOnDisplayWorkArea,
  fitWindowToDisplayWorkArea,
} = require('./display_affinity_runtime.cjs');

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
  const shouldRestoreResponse = focus && (responseOverlayVisible || isResponseOverlayStreamingPhase());
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

function hideMainWindow(deps = {}) {
  const { mainWindow } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  }
  return { success: true };
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
  resolveShowTargetDisplayAffinity,
  showChatWindow,
  showMainWindow,
};
