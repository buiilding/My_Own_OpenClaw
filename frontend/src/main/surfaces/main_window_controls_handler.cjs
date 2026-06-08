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

function focusAvailableMainWindow(mainWindow) {
  try {
    if (typeof mainWindow.isMinimized === 'function' && mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (typeof mainWindow.isVisible === 'function' && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (typeof mainWindow.moveTop === 'function') {
      mainWindow.moveTop();
    }
    if (typeof mainWindow.focus === 'function') {
      mainWindow.focus();
    }
    if (typeof mainWindow.webContents?.focus === 'function') {
      mainWindow.webContents.focus();
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: error?.message || String(error),
    };
  }
}

async function focusWindowForPermissionPrompt(deps = {}) {
  const {
    mainWindow,
    platform = process.platform,
    leaveFullScreenTimeoutMs = 1500,
  } = deps;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getUnavailableMainWindowResult();
  }

  const shouldExitFullscreenFirst = (
    platform === 'darwin'
    && typeof mainWindow.isFullScreen === 'function'
    && mainWindow.isFullScreen()
    && typeof mainWindow.setFullScreen === 'function'
    && typeof mainWindow.once === 'function'
  );

  if (!shouldExitFullscreenFirst) {
    return focusAvailableMainWindow(mainWindow);
  }

  return await new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const finishFocus = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      resolve(focusAvailableMainWindow(mainWindow));
    };

    try {
      timeoutId = setTimeout(finishFocus, leaveFullScreenTimeoutMs);
      mainWindow.once('leave-full-screen', finishFocus);
      mainWindow.setFullScreen(false);
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        success: false,
        reason: error?.message || String(error),
      });
    }
  });
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
  focusWindowForPermissionPrompt,
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
};
