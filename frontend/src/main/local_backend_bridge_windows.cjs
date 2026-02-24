function createWindowResolvers(getWindows) {
  const resolveWindowProvider = () => {
    if (typeof getWindows === 'function') {
      return getWindows;
    }
    if (getWindows && typeof getWindows === 'object') {
      if ('mainWindow' in getWindows || 'chatWindow' in getWindows) {
        return () => getWindows;
      }
      return () => ({ mainWindow: getWindows, chatWindow: null });
    }
    return () => ({});
  };
  const getWindowState = resolveWindowProvider();

  const resolveWindows = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      const { mainWindow, chatWindow, responseWindow } = result;
      return [mainWindow, chatWindow, responseWindow].filter(Boolean);
    }
    return [];
  };

  const resolveChatWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.chatWindow || null;
    }
    return null;
  };

  const resolveResponseWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.responseWindow || null;
    }
    return null;
  };

  return {
    resolveChatWindow,
    resolveResponseWindow,
    resolveWindows,
  };
}

async function withHiddenWindowForScreenshot({
  resolveWindows,
  resolveChatWindow,
  resolveResponseWindow,
  task,
}) {
  if (process.platform !== 'linux') {
    return task();
  }

  const windows = resolveWindows().filter((win) => win && !win.isDestroyed());
  const chatWindow = resolveChatWindow();
  const responseWindow = resolveResponseWindow();
  if (windows.length === 0) {
    return task();
  }

  const windowStates = windows.map((win) => ({
    win,
    wasVisible: win.isVisible(),
    wasFocused: win.isFocused(),
    wasMinimized: win.isMinimized(),
  }));
  const focusedWindow = windowStates.find((state) => state.wasFocused)?.win || null;

  for (const state of windowStates) {
    if (state.wasVisible && !state.wasMinimized) {
      state.win.hide();
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 320));

  try {
    return await task();
  } finally {
    for (const state of windowStates) {
      if (state.wasVisible && !state.wasMinimized && !state.win.isDestroyed()) {
        const isOverlayWindow = (
          (chatWindow && state.win === chatWindow)
          || (responseWindow && state.win === responseWindow)
        );
        if (isOverlayWindow && typeof state.win.showInactive === 'function') {
          state.win.showInactive();
        } else {
          state.win.show();
          if (
            chatWindow
            && state.win === chatWindow
            && !state.wasFocused
            && typeof state.win.blur === 'function'
          ) {
            state.win.blur();
          }
        }
        if (isOverlayWindow) {
          try {
            state.win.setAlwaysOnTop(true, 'floating');
            if (typeof state.win.moveTop === 'function') {
              state.win.moveTop();
            }
          } catch (error) {
            console.warn('[LocalBackend] Failed to keep overlay on top:', error?.message || error);
          }
        }
      }
    }
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      focusedWindow.focus();
    }
  }
}

module.exports = {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
};
