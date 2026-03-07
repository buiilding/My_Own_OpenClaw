const { setOverlayAlwaysOnTop } = require('./overlay_topmost_runtime.cjs');

function createOverlayWindowHelpersRuntime(deps = {}) {
  const {
    screen,
    getChatWindow = () => null,
    getResponseWindow = () => null,
    getContextLabelWindow = () => null,
    getResponseOverlayVisible = () => false,
    getOverlayChatWindowBounds,
    getOverlayResponseWindowBounds,
    getOverlayContextLabelWindowBounds,
    contextLabelWidth,
    contextLabelHeight,
    contextLabelOffsetX,
    contextLabelGapAboveChatbox,
    responseGap = 10,
    platform = process.platform,
    getChatVisualAnchorHeight = null,
    chatVisualAnchorHeight = null,
    warn = console.warn,
  } = deps;
  let manualChatWindowPosition = null;

  function getAnchoredChatBounds(chatBounds) {
    if (!chatBounds || typeof chatBounds !== 'object') {
      return null;
    }
    const configuredAnchorHeight = (
      typeof getChatVisualAnchorHeight === 'function'
        ? Number(getChatVisualAnchorHeight())
        : Number(chatVisualAnchorHeight)
    );
    if (!Number.isFinite(configuredAnchorHeight) || configuredAnchorHeight <= 0) {
      return chatBounds;
    }
    const currentHeight = Math.max(1, Math.round(Number(chatBounds.height) || 0));
    const anchorHeight = Math.min(currentHeight, Math.round(configuredAnchorHeight));
    const topOffset = Math.max(0, currentHeight - anchorHeight);
    if (topOffset === 0) {
      return chatBounds;
    }
    return {
      ...chatBounds,
      y: Math.round(Number(chatBounds.y) || 0) + topOffset,
      height: anchorHeight,
    };
  }

  function getChatWindowBounds(width, height) {
    return getOverlayChatWindowBounds({ screen, width, height });
  }

  function getResponseWindowBounds(width, height, options = {}) {
    const chatWindow = getChatWindow();
    const chatBounds = chatWindow
      && !chatWindow.isDestroyed()
      && typeof chatWindow.getBounds === 'function'
      ? chatWindow.getBounds()
      : null;
    const anchoredChatBounds = getAnchoredChatBounds(chatBounds);
    return getOverlayResponseWindowBounds({
      screen,
      width,
      height,
      chatBounds: anchoredChatBounds,
      gap: responseGap,
      compactHover: options?.compactHover === true,
    });
  }

  function getContextLabelWindowBounds() {
    const chatWindow = getChatWindow();
    const chatBounds = chatWindow
      && !chatWindow.isDestroyed()
      && typeof chatWindow.getBounds === 'function'
      ? chatWindow.getBounds()
      : null;
    const anchoredChatBounds = getAnchoredChatBounds(chatBounds);
    return getOverlayContextLabelWindowBounds({
      screen,
      chatBounds: anchoredChatBounds,
      labelWidth: contextLabelWidth,
      labelHeight: contextLabelHeight,
      offsetX: contextLabelOffsetX,
      gapAbove: contextLabelGapAboveChatbox,
    });
  }

  function positionResponseWindow() {
    const responseWindow = getResponseWindow();
    if (!responseWindow || responseWindow.isDestroyed() || !getResponseOverlayVisible()) {
      return;
    }
    const [width, height] = responseWindow.getSize();
    const bounds = getResponseWindowBounds(width, height);
    responseWindow.setBounds(bounds, false);
  }

  function positionContextLabelWindow() {
    const contextLabelWindow = getContextLabelWindow();
    if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
      return;
    }
    const bounds = getContextLabelWindowBounds();
    contextLabelWindow.setBounds(bounds, false);
  }

  function positionChatWindow() {
    const chatWindow = getChatWindow();
    if (!chatWindow) {
      return;
    }
    const [width, height] = chatWindow.getSize();
    const { x, y } = manualChatWindowPosition || getChatWindowBounds(width, height);
    chatWindow.setPosition(x, y, false);
    positionResponseWindow();
    positionContextLabelWindow();
  }

  function setManualChatWindowPosition(position) {
    if (!position || typeof position !== 'object') {
      manualChatWindowPosition = null;
      return false;
    }
    const x = Math.round(Number(position.x));
    const y = Math.round(Number(position.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }
    manualChatWindowPosition = { x, y };
    return true;
  }

  function ensureResponseOverlayFallbackBounds() {
    const responseWindow = getResponseWindow();
    if (!responseWindow || responseWindow.isDestroyed()) {
      return;
    }
    const chatWindow = getChatWindow();
    const defaultWidth = chatWindow
      && !chatWindow.isDestroyed()
      && typeof chatWindow.getSize === 'function'
      ? chatWindow.getSize()[0]
      : 520;
    const [currentWidth, currentHeight] = responseWindow.getSize();
    const width = Math.max(1, currentWidth || defaultWidth);
    // Keep compact awaiting typing overlays from being forced to taller fallback
    // bounds during hide/show restore races.
    const height = Math.max(24, currentHeight || 0);
    const bounds = getResponseWindowBounds(width, height);
    responseWindow.setBounds(bounds, false);
  }

  function ensureChatWindowOnTop() {
    const chatWindow = getChatWindow();
    if (!chatWindow || chatWindow.isDestroyed()) {
      return;
    }
    const promoted = setOverlayAlwaysOnTop({
      targetWindow: chatWindow,
      platform,
      warn,
      windowLabel: 'chat box',
    });
    if (promoted && typeof chatWindow.moveTop === 'function') {
      chatWindow.moveTop();
    }
  }

  function ensureResponseWindowOnTop() {
    const responseWindow = getResponseWindow();
    if (!responseWindow || responseWindow.isDestroyed() || !getResponseOverlayVisible()) {
      return;
    }
    const promoted = setOverlayAlwaysOnTop({
      targetWindow: responseWindow,
      platform,
      warn,
      windowLabel: 'response overlay',
    });
    if (promoted && typeof responseWindow.moveTop === 'function') {
      responseWindow.moveTop();
    }
  }

  function ensureContextLabelWindowOnTop() {
    const contextLabelWindow = getContextLabelWindow();
    if (!contextLabelWindow || contextLabelWindow.isDestroyed() || !contextLabelWindow.isVisible()) {
      return;
    }
    const promoted = setOverlayAlwaysOnTop({
      targetWindow: contextLabelWindow,
      platform,
      warn,
      windowLabel: 'context label',
    });
    if (promoted && typeof contextLabelWindow.moveTop === 'function') {
      contextLabelWindow.moveTop();
    }
  }

  function showResponseWindowInactive() {
    const responseWindow = getResponseWindow();
    if (!responseWindow || responseWindow.isDestroyed()) {
      return;
    }
    if (typeof responseWindow.showInactive === 'function') {
      responseWindow.showInactive();
    } else {
      responseWindow.show();
    }
    ensureResponseWindowOnTop();
  }

  function showResponseWindowWhenChatVisible() {
    const chatWindow = getChatWindow();
    if (!chatWindow || chatWindow.isDestroyed() || !chatWindow.isVisible()) {
      return;
    }
    showResponseWindowInactive();
  }

  function showContextLabelWindowInactive() {
    const contextLabelWindow = getContextLabelWindow();
    if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
      return;
    }
    positionContextLabelWindow();
    if (typeof contextLabelWindow.showInactive === 'function') {
      contextLabelWindow.showInactive();
    } else {
      contextLabelWindow.show();
    }
    ensureContextLabelWindowOnTop();
  }

  function syncContextLabelWindowVisibility() {
    const contextLabelWindow = getContextLabelWindow();
    if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
      return;
    }
    const chatWindow = getChatWindow();
    const shouldShow = Boolean(
      chatWindow
        && !chatWindow.isDestroyed()
        && chatWindow.isVisible()
        && !getResponseOverlayVisible(),
    );

    if (!shouldShow) {
      if (contextLabelWindow.isVisible()) {
        contextLabelWindow.hide();
      }
      return;
    }
    showContextLabelWindowInactive();
  }

  return {
    ensureResponseOverlayFallbackBounds,
    positionChatWindow,
    setManualChatWindowPosition,
    getChatWindowBounds,
    getResponseWindowBounds,
    getContextLabelWindowBounds,
    positionResponseWindow,
    positionContextLabelWindow,
    ensureChatWindowOnTop,
    ensureResponseWindowOnTop,
    ensureContextLabelWindowOnTop,
    showResponseWindowInactive,
    showResponseWindowWhenChatVisible,
    showContextLabelWindowInactive,
    syncContextLabelWindowVisibility,
  };
}

module.exports = {
  createOverlayWindowHelpersRuntime,
};
