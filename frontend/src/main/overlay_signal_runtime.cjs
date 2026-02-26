function syncWakewordToggleForChatVisibility(deps = {}) {
  const {
    mainWindow,
    chatWindow,
    channel = 'wakeword-toggle',
  } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const isChatVisible = Boolean(
    chatWindow
      && !chatWindow.isDestroyed()
      && chatWindow.isVisible(),
  );
  mainWindow.webContents.send(channel, { enabled: !isChatVisible });
}

function emitWakewordSttTrigger(deps = {}) {
  const {
    chatWindow,
    channel,
  } = deps;
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindow.webContents) {
    return;
  }
  chatWindow.webContents.send(channel, { source: 'wakeword' });
}

function broadcastResponseOverlayVisibility(deps = {}) {
  const {
    visible,
    windows = [],
    channel = 'response-overlay-visibility',
  } = deps;
  const payload = { visible: Boolean(visible) };
  for (const win of windows) {
    if (!win || win.isDestroyed() || !win.webContents) {
      continue;
    }
    win.webContents.send(channel, payload);
  }
}

function setResponseOverlayVisibilityState(visible, deps = {}) {
  const {
    setResponseOverlayVisible = () => {},
    broadcastResponseOverlayVisibility = () => {},
    syncContextLabelWindowVisibility = () => {},
  } = deps;
  setResponseOverlayVisible(Boolean(visible));
  broadcastResponseOverlayVisibility(Boolean(visible));
  syncContextLabelWindowVisibility();
}

module.exports = {
  broadcastResponseOverlayVisibility,
  emitWakewordSttTrigger,
  setResponseOverlayVisibilityState,
  syncWakewordToggleForChatVisibility,
};
