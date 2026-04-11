function getUnavailableMainWindowResult(withMaximizeState = false) {
  if (withMaximizeState) {
    return {
      success: false,
      reason: 'Main window not available',
      isMaximized: false,
    };
  }
  return { success: false, reason: 'Main window not available' };
}

function handleWindowMinimize(deps = {}) {
  const { mainWindow } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getUnavailableMainWindowResult();
  }
  mainWindow.minimize();
  return { success: true };
}

function handleWindowToggleMaximize(deps = {}) {
  const {
    mainWindow,
    platform = process.platform,
  } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getUnavailableMainWindowResult(true);
  }

  if (platform === 'darwin' && typeof mainWindow.setFullScreen === 'function') {
    const isFullScreen = typeof mainWindow.isFullScreen === 'function'
      ? mainWindow.isFullScreen()
      : false;
    const nextFullScreen = !isFullScreen;
    mainWindow.setFullScreen(nextFullScreen);
    return { success: true, isMaximized: nextFullScreen };
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return { success: true, isMaximized: mainWindow.isMaximized() };
}

function handleWindowClose(deps = {}) {
  const { mainWindow } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getUnavailableMainWindowResult();
  }
  mainWindow.close();
  return { success: true };
}

module.exports = {
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
};
