const {
  handleHideChatbox,
  handleHandoffSurfaceForComputerUse,
  handlePrepareSurfaceForScreenshot,
  handleRestoreSurfaceAfterScreenshot,
  handleShowChatbox,
} = require('./overlay_visibility_handler.cjs');
const {
  resolveActiveSurfaceDisplayAffinityForWindows,
  resolveDisplayAffinityForBounds,
} = require('./display_affinity_runtime.cjs');
const { handleMoveChatboxTo } = require('./overlay_chatbox_handler.cjs');
const { handleSetChatboxVisualAnchorHeight } = require('./overlay_chatbox_visual_anchor_handler.cjs');
const { handleSetResponseboxSize } = require('./overlay_responsebox_handler.cjs');

function initializeOverlayPhaseHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    BrowserWindow,
    screen,
    getWindows = () => ({}),
    positionChatWindow,
    getActiveDisplayAffinity = () => null,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    syncWindowDisplayAffinity = () => {},
    setManualChatWindowPosition,
    setChatVisualAnchorHeight,
    resizeChatWindowForVisualAnchorHeight,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
    setActiveDisplayAffinity = () => {},
    showChatWindow,
    hideChatWindow,
    hideMainWindow,
    warn = console.warn,
  } = deps;

  ipcMain.handle('set-chatbox-visual-anchor-height', async (_event, args = {}) => {
    return handleSetChatboxVisualAnchorHeight(args, {
      setChatVisualAnchorHeight,
      resizeChatWindowForVisualAnchorHeight,
      positionChatWindow,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn,
    });
  });

  ipcMain.on('move-chatbox-to', (_event, { x, y } = {}) => {
    const { chatWindow } = getWindows();
    handleMoveChatboxTo({ x, y }, {
      screen,
      chatWindow,
      resolveDisplayAffinityForBounds,
      setActiveDisplayAffinity,
      setManualChatWindowPosition,
      positionChatWindow,
      syncWindowDisplayAffinity,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn,
    });
  });

  ipcMain.handle('set-responsebox-size', async (_event, args = {}) => {
    const { responseWindow, chatWindow, mainWindow } = getWindows();
    return handleSetResponseboxSize(args, {
      responseWindow,
      chatWindow,
      mainWindow,
      BrowserWindow,
      screen,
      getActiveDisplayAffinity,
      getResponseWindowBounds,
      setResponseOverlayVisibilityState,
      showResponseWindowWhenChatVisible,
      getResponseOverlayVisible: () => {
        const currentResponseWindow = getWindows().responseWindow;
        return Boolean(
          currentResponseWindow
            && !currentResponseWindow.isDestroyed()
            && currentResponseWindow.isVisible(),
        );
      },
      getResponseOverlayPhase: () => {
        const { responseOverlayPhase } = deps.getState ? deps.getState() : {};
        return responseOverlayPhase || null;
      },
    });
  });

  ipcMain.handle('show-chatbox', async (event, options = {}) => {
    return handleShowChatbox(options, {
      showChatWindow,
      resolveTargetDisplayAffinity: () => resolveActiveSurfaceDisplayAffinityForWindows({
        BrowserWindow,
        screen,
        webContents: event?.sender || null,
        getWindows,
        getActiveDisplayAffinity,
      }),
      positionChatWindow,
      setActiveDisplayAffinity,
    });
  });

  ipcMain.handle('hide-chatbox', async () => {
    return handleHideChatbox({ hideChatWindow });
  });

  ipcMain.handle('handoff-surface-for-computer-use', async (_event, options = {}) => {
    return handleHandoffSurfaceForComputerUse(options, {
      getWindows,
      showChatWindow,
    });
  });

  ipcMain.handle('prepare-surface-for-screenshot', async (event, options = {}) => {
    return await handlePrepareSurfaceForScreenshot(event, options, {
      getWindows,
      hideChatWindow,
      hideMainWindow,
    });
  });

  ipcMain.handle('restore-surface-after-screenshot', async (_event, options = {}) => {
    return handleRestoreSurfaceAfterScreenshot(options, {
      showChatWindow,
      showMainWindow: (showOptions = {}) => deps.showMainWindow?.(showOptions),
    });
  });
}

module.exports = {
  initializeOverlayPhaseHandlersRuntime,
};
