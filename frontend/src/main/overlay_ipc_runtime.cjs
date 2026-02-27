const os = require('os');
const { handleSetAgentSudoAccess } = require('./agent_sudo_access_handler.cjs');
const {
  checkPermissions,
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('./permission_service.cjs');
const { handleGetDisplays } = require('./display_query_handler.cjs');
const {
  handleHideChatbox,
  handleShowChatbox,
  handleShowMainWindow,
} = require('./overlay_visibility_handler.cjs');
const {
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
} = require('./main_window_controls_handler.cjs');
const { handleSetOverlayIgnoreMouse } = require('./overlay_mouse_handler.cjs');
const { handleMoveChatboxTo, handleSetChatboxSize } = require('./overlay_chatbox_handler.cjs');
const { handleSetResponseboxSize } = require('./overlay_responsebox_handler.cjs');

function resolveUsername() {
  try {
    return os.userInfo()?.username;
  } catch (_error) {
    return '';
  }
}

function initializeOverlayHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    screen,
    shell,
    systemPreferences,
    platform,
    getWindows = () => ({}),
    getChatWindowBounds,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
    showMainWindow,
    showChatWindow,
    hideChatWindow,
    prepareOverlayToolFocus,
    normalizeMainWindowOpenTarget,
    emitMainWindowOpenTarget,
    warn = console.warn,
  } = deps;

  const permissionDeps = {
    platform,
    shell,
    systemPreferences,
  };
  const getPermissionId = (options = {}) => {
    return typeof options?.permissionId === 'string'
      ? options.permissionId
      : '';
  };
  const buildPermissionProbeResult = (permissionId) => {
    return {
      success: true,
      data: {
        status: runPermissionProbe(permissionId, permissionDeps),
      },
    };
  };

  ipcMain.handle('set-overlay-ignore-mouse', async (_event, { ignore } = {}) => {
    const { chatWindow, responseWindow, contextLabelWindow } = getWindows();
    return handleSetOverlayIgnoreMouse({ ignore }, {
      chatWindow,
      responseWindow,
      contextLabelWindow,
    });
  });

  ipcMain.handle('set-chatbox-size', async (_event, args = {}) => {
    const { chatWindow } = getWindows();
    return handleSetChatboxSize(args, {
      chatWindow,
      getChatWindowBounds,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
    });
  });

  ipcMain.on('move-chatbox-to', (_event, { x, y } = {}) => {
    const { chatWindow } = getWindows();
    handleMoveChatboxTo({ x, y }, {
      chatWindow,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn,
    });
  });

  ipcMain.handle('set-responsebox-size', async (_event, args = {}) => {
    const { responseWindow, chatWindow } = getWindows();
    return handleSetResponseboxSize(args, {
      responseWindow,
      chatWindow,
      screen,
      getResponseWindowBounds,
      setResponseOverlayVisibilityState,
      showResponseWindowWhenChatVisible,
    });
  });

  ipcMain.handle('show-main-window', async (_event, options = {}) => {
    const result = handleShowMainWindow(options, { showMainWindow });
    const target = normalizeMainWindowOpenTarget(options);
    if (result?.success && target) {
      emitMainWindowOpenTarget(target);
    }
    return result;
  });

  ipcMain.handle('show-chatbox', async (_event, options = {}) => {
    return handleShowChatbox(options, { showChatWindow });
  });

  ipcMain.handle('hide-chatbox', async () => {
    return handleHideChatbox({ hideChatWindow });
  });

  ipcMain.handle('prepare-overlay-tool-focus', async (_event, options = {}) => {
    if (typeof prepareOverlayToolFocus !== 'function') {
      return { success: false, reason: 'Overlay focus preparation unavailable' };
    }
    const waitMs = typeof options?.waitMs === 'number' ? options.waitMs : 180;
    try {
      const data = await prepareOverlayToolFocus({ waitMs });
      return { success: true, data: data || null };
    } catch (error) {
      return {
        success: false,
        reason: `Failed to prepare overlay tool focus: ${error.message}`,
      };
    }
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

  ipcMain.handle('set-agent-sudo-access', async (_event, options = {}) => {
    return await handleSetAgentSudoAccess(options, {
      platform,
      username: resolveUsername(),
    });
  });

  ipcMain.handle('list-permissions', async () => {
    return {
      success: true,
      data: listPermissionsWithStatus(permissionDeps),
    };
  });

  ipcMain.handle('check-permissions', async (_event, options = {}) => {
    const permissionIds = Array.isArray(options?.permissionIds) ? options.permissionIds : null;
    return {
      success: true,
      data: {
        statuses: checkPermissions(permissionIds, permissionDeps),
      },
    };
  });

  ipcMain.handle('check-permission', async (_event, options = {}) => {
    return buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('run-permission-probe', async (_event, options = {}) => {
    return buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('request-permission', async (_event, options = {}) => {
    const permissionId = getPermissionId(options);
    return {
      success: true,
      data: {
        status: await requestPermission(permissionId, permissionDeps),
      },
    };
  });
}

module.exports = {
  initializeOverlayHandlersRuntime,
};
