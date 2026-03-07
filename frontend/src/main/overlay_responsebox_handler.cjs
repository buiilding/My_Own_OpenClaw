const {
  resolveActiveSurfaceDisplayAffinity,
} = require('./display_affinity_runtime.cjs');

function resolveFullscreenBounds({
  BrowserWindow,
  screen,
  webContents,
  chatWindow,
  mainWindow,
  getActiveDisplayAffinity,
}) {
  const displayAffinity = resolveActiveSurfaceDisplayAffinity({
    BrowserWindow,
    screen,
    webContents,
    chatWindow,
    mainWindow,
    getActiveDisplayAffinity,
  });
  const bounds = displayAffinity?.bounds || screen.getPrimaryDisplay()?.bounds;
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

async function handleSetResponseboxSize(
  {
    width,
    height,
    visible,
    full_screen: fullScreen = false,
    compact_hover: compactHover = false,
  } = {},
  deps = {},
) {
  const {
    responseWindow,
    chatWindow,
    mainWindow,
    screen,
    BrowserWindow,
    webContents = null,
    getActiveDisplayAffinity = () => null,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
  } = deps;

  if (!responseWindow || responseWindow.isDestroyed()) {
    return { success: false, reason: 'Response window not available' };
  }

  const shouldShow = Boolean(visible);
  if (!shouldShow) {
    setResponseOverlayVisibilityState(false);
    if (responseWindow.isVisible()) {
      responseWindow.hide();
    }
    return { success: true, visible: false };
  }

  if (fullScreen === true) {
    try {
      const nextBounds = resolveFullscreenBounds({
        BrowserWindow,
        screen,
        webContents,
        chatWindow,
        mainWindow,
        getActiveDisplayAffinity,
      });
      responseWindow.setBounds(nextBounds, false);
      setResponseOverlayVisibilityState(true);
      showResponseWindowWhenChatVisible();
      return {
        success: true,
        visible: true,
        fullScreen: true,
        width: nextBounds.width,
        height: nextBounds.height,
      };
    } catch (error) {
      return { success: false, reason: `Failed to enter fullscreen ghost overlay: ${error.message}` };
    }
  }

  const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
  const nextHeight = Math.max(1, Math.min(750, Math.round(Number(height) || 0)));
  try {
    const bounds = compactHover
      ? getResponseWindowBounds(nextWidth, nextHeight, { compactHover: true })
      : getResponseWindowBounds(nextWidth, nextHeight);
    responseWindow.setBounds(bounds, false);
    setResponseOverlayVisibilityState(true);
    showResponseWindowWhenChatVisible();
    return {
      success: true,
      visible: true,
      width: nextWidth,
      height: nextHeight,
    };
  } catch (error) {
    return { success: false, reason: `Failed to resize response overlay: ${error.message}` };
  }
}

module.exports = {
  handleSetResponseboxSize,
};
