const {
  handleActivateChatboxTextEntry,
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
    setChatboxHitTestActive = () => false,
    setResponseboxHitTestActive = () => false,
    setChatWindowBoundsForVisualAnchorHeight,
    resizeChatWindowForVisualAnchorHeight,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    broadcastResponseOverlayVisibility = () => {},
    showResponseWindowInactive,
    getActiveResponseOverlayGuardRef = () => null,
    setActiveResponseOverlayGuardRef = () => {},
    dismissResponseOverlayGuardRef = () => false,
    canShowFloatingResponseOverlay = () => true,
    setActiveDisplayAffinity = () => {},
    activateChatboxTextEntry,
    showChatWindow,
    hideChatWindow,
    hideMainWindow,
    warn = console.warn,
  } = deps;

  ipcMain.handle('set-chatbox-visual-anchor-height', async (_event, args = {}) => {
    return handleSetChatboxVisualAnchorHeight(args, {
      setChatVisualAnchorHeight,
      setChatWindowBoundsForVisualAnchorHeight,
      resizeChatWindowForVisualAnchorHeight,
      positionChatWindow,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn,
    });
  });

  ipcMain.handle('set-chatbox-hit-test-active', async (_event, args = {}) => {
    const nextActive = args?.active === true;
    const changed = setChatboxHitTestActive(nextActive);
    deps.syncChatboxHitTestState?.();
    return {
      success: true,
      active: nextActive,
      changed: Boolean(changed),
    };
  });

  ipcMain.handle('set-responsebox-hit-test-active', async (_event, args = {}) => {
    const nextActive = args?.active === true;
    const changed = setResponseboxHitTestActive(nextActive);
    deps.syncResponseboxHitTestState?.();
    return {
      success: true,
      active: nextActive,
      changed: Boolean(changed),
    };
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
    const { responseWindow, chatWindow, mainWindow, contextLabelWindow } = getWindows();
    return handleSetResponseboxSize(args, {
      responseWindow,
      chatWindow,
      mainWindow,
      contextLabelWindow,
      BrowserWindow,
      screen,
      getActiveDisplayAffinity,
      getResponseWindowBounds,
      setResponseOverlayVisibilityState,
      showResponseWindowForLiveTurnIntent: showResponseWindowInactive,
      getActiveResponseOverlayGuardRef,
      setActiveResponseOverlayGuardRef,
      dismissResponseOverlayGuardRef,
      syncContextLabelWindowVisibility,
      canShowFloatingResponseOverlay,
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

  ipcMain.handle('activate-chatbox-text-entry', async (event, options = {}) => {
    return handleActivateChatboxTextEntry(options, {
      activateChatboxTextEntry,
      resolveTargetDisplayAffinity: () => resolveActiveSurfaceDisplayAffinityForWindows({
        BrowserWindow,
        screen,
        webContents: event?.sender || null,
        getWindows,
        getActiveDisplayAffinity,
      }),
    });
  });

  ipcMain.handle('hide-chatbox', async (_event, options = {}) => {
    return handleHideChatbox(options, { hideChatWindow });
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
      responseWindow: getWindows().responseWindow,
      contextLabelWindow: getWindows().contextLabelWindow,
      broadcastResponseOverlayVisibility,
    });
  });

  ipcMain.handle('restore-surface-after-screenshot', async (_event, options = {}) => {
    return handleRestoreSurfaceAfterScreenshot(options, {
      showChatWindow,
      showMainWindow: (showOptions = {}) => deps.showMainWindow?.(showOptions),
      showResponseWindowInactive,
      ensureResponseOverlayFallbackBounds: deps.ensureResponseOverlayFallbackBounds,
      setResponseOverlayVisibilityState,
      syncContextLabelWindowVisibility,
      canShowFloatingResponseOverlay,
      responseWindow: getWindows().responseWindow,
    });
  });
}

module.exports = {
  initializeOverlayPhaseHandlersRuntime,
};
