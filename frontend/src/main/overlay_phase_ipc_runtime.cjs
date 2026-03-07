const {
  handleHideChatbox,
  handlePrepareChatboxForScreenshot,
  handleShowChatbox,
} = require('./overlay_visibility_handler.cjs');
const { handleMoveChatboxTo } = require('./overlay_chatbox_handler.cjs');
const { handleSetChatboxVisualAnchorHeight } = require('./overlay_chatbox_visual_anchor_handler.cjs');
const { handleSetResponseboxSize } = require('./overlay_responsebox_handler.cjs');

function initializeOverlayPhaseHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    screen,
    getWindows = () => ({}),
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    setChatVisualAnchorHeight,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
    showChatWindow,
    hideChatWindow,
    warn = console.warn,
  } = deps;

  ipcMain.handle('set-chatbox-visual-anchor-height', async (_event, args = {}) => {
    return handleSetChatboxVisualAnchorHeight(args, {
      setChatVisualAnchorHeight,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn,
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

  ipcMain.handle('show-chatbox', async (_event, options = {}) => {
    return handleShowChatbox(options, { showChatWindow });
  });

  ipcMain.handle('hide-chatbox', async () => {
    return handleHideChatbox({ hideChatWindow });
  });

  ipcMain.handle('prepare-chatbox-for-screenshot', async (_event, options = {}) => {
    return await handlePrepareChatboxForScreenshot(options, { hideChatWindow });
  });
}

module.exports = {
  initializeOverlayPhaseHandlersRuntime,
};
