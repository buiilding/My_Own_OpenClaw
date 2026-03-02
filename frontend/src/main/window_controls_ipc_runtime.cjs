const { handleGetDisplays } = require('./display_query_handler.cjs');
const { handleShowMainWindow } = require('./overlay_visibility_handler.cjs');
const {
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
} = require('./main_window_controls_handler.cjs');

function initializeWindowControlHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    screen,
    getWindows = () => ({}),
    showMainWindow,
    normalizeMainWindowOpenTarget,
    emitMainWindowOpenTarget,
  } = deps;

  ipcMain.handle('show-main-window', async (_event, options = {}) => {
    const result = handleShowMainWindow(options, { showMainWindow });
    const target = normalizeMainWindowOpenTarget(options);
    if (result?.success && target) {
      emitMainWindowOpenTarget(target);
    }
    return result;
  });

  ipcMain.handle('get-main-window-visibility', async () => {
    const { mainWindow } = getWindows();
    const visible = Boolean(
      mainWindow
      && !mainWindow.isDestroyed()
      && mainWindow.isVisible()
    );
    return {
      success: true,
      data: { visible },
    };
  });

  ipcMain.handle('get-displays', async () => {
    return handleGetDisplays({ screen });
  });

  ipcMain.handle('window-minimize', async () => {
    const { mainWindow } = getWindows();
    return handleWindowMinimize({ mainWindow });
  });

  ipcMain.handle('window-toggle-maximize', async () => {
    const { mainWindow } = getWindows();
    return handleWindowToggleMaximize({ mainWindow });
  });

  ipcMain.handle('window-close', async () => {
    const { mainWindow } = getWindows();
    return handleWindowClose({ mainWindow });
  });
}

module.exports = {
  initializeWindowControlHandlersRuntime,
};
