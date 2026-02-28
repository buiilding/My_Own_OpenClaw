function handleSetOverlayFocusable(
  {
    focusable,
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
      if (typeof win.setFocusable === 'function') {
        win.setFocusable(Boolean(focusable));
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, reason: `Failed to update focusable state: ${error.message}` };
  }
}

module.exports = {
  handleSetOverlayFocusable,
};
