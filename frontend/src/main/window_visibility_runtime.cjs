function showChatWindow(options = {}, deps = {}) {
  const {
    chatWindow,
    mainWindow,
    responseWindow,
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
  if (!chatWindow.isVisible()) {
    if (!focus && typeof chatWindow.showInactive === 'function') {
      chatWindow.showInactive();
    } else {
      chatWindow.show();
    }
  }
  ensureChatWindowOnTop();
  const shouldRestoreResponse = responseOverlayVisible || isResponseOverlayStreamingPhase();
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

function showMainWindow(options = {}, deps = {}) {
  const {
    mainWindow,
    chatWindow,
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
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (maximize) {
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
  hideChatWindow,
  showChatWindow,
  showMainWindow,
};
