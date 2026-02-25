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
  const { mainWindow } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getUnavailableMainWindowResult(true);
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
