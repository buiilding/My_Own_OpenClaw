function handleSetOverlayIgnoreMouse(
  {
    ignore,
  } = {},
  deps = {},
) {
  const {
    chatWindow,
    responseWindow,
    contextLabelWindow,
  } = deps;

  const targetWindows = [chatWindow, responseWindow, contextLabelWindow].filter(
    (win) => win && !win.isDestroyed(),
  );
  if (targetWindows.length === 0) {
    return { success: false, reason: 'Overlay windows not available' };
  }

  try {
    targetWindows.forEach((win) => {
      if (ignore) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, reason: `Failed to update ignore state: ${error.message}` };
  }
}

module.exports = {
  handleSetOverlayIgnoreMouse,
};
