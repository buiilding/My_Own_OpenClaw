const { setOverlayAlwaysOnTop } = require('./overlay_topmost_runtime.cjs');
const responseOverlayLayoutContract = require('../../shared/response_overlay_layout_contract.json');

const CHAT_WINDOW_FRAME_HEIGHT_PADDING = 6;
const CHAT_WINDOW_FIXED_FRAME_HEIGHT = 164;
const RESPONSE_OVERLAY_AWAITING_FRAME_HEIGHT = (
  Number(responseOverlayLayoutContract?.awaiting_frame_height) || 24
);

function normalizeFiniteRounded(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
}

function normalizeChatBoundsForAnchor(chatBounds) {
  if (!chatBounds || typeof chatBounds !== 'object') {
    return null;
  }
  const x = normalizeFiniteRounded(chatBounds.x);
  const y = normalizeFiniteRounded(chatBounds.y);
  const width = normalizeFiniteRounded(chatBounds.width);
  const height = normalizeFiniteRounded(chatBounds.height);
  if (
    x === null
    || y === null
    || width === null
    || height === null
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  return {
    ...chatBounds,
    x,
    y,
    width,
    height,
  };
}

function createOverlayWindowHelpersRuntime(deps = {}) {
  const {
    screen,
    getActiveDisplayAffinity = () => null,
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
  let chatWindowHeightOverride = null;

  function getActiveMonitorId() {
    const activeDisplayAffinity = getActiveDisplayAffinity();
    if (!activeDisplayAffinity || typeof activeDisplayAffinity !== 'object') {
      return null;
    }
    return typeof activeDisplayAffinity.monitor_id === 'string'
      ? activeDisplayAffinity.monitor_id
      : null;
  }

  function getAnchoredChatBounds(chatBounds) {
    const normalizedChatBounds = normalizeChatBoundsForAnchor(chatBounds);
    if (!normalizedChatBounds) {
      return null;
    }
    const configuredAnchorHeight = (
      typeof getChatVisualAnchorHeight === 'function'
        ? Number(getChatVisualAnchorHeight())
        : Number(chatVisualAnchorHeight)
    );
    if (!Number.isFinite(configuredAnchorHeight) || configuredAnchorHeight <= 0) {
      return normalizedChatBounds;
    }
    const currentHeight = normalizedChatBounds.height;
    const anchorHeight = Math.min(currentHeight, Math.round(configuredAnchorHeight));
    const topOffset = Math.max(0, currentHeight - anchorHeight);
    if (topOffset === 0) {
      return normalizedChatBounds;
    }
    return {
      ...normalizedChatBounds,
      y: normalizedChatBounds.y + topOffset,
      height: anchorHeight,
    };
  }

  function getChatWindowBounds(width, height) {
    return getOverlayChatWindowBounds({
      screen,
      width,
      height,
      displayAffinity: getActiveDisplayAffinity(),
      targetX: null,
    });
  }

  function getChatWindowFrameHeightForVisualAnchorHeight(anchorHeight, options = {}) {
    const normalizedAnchorHeight = Math.max(1, Math.round(Number(anchorHeight) || 0));
    const requestedFrameHeight = Math.round(Number(options?.frameHeight));
    return Math.max(
      CHAT_WINDOW_FIXED_FRAME_HEIGHT,
      normalizedAnchorHeight + CHAT_WINDOW_FRAME_HEIGHT_PADDING,
      Number.isFinite(requestedFrameHeight) && requestedFrameHeight > 0
        ? requestedFrameHeight
        : 0,
    );
  }

  function resolveChatWindowPositionForHeight(width, height) {
    const activeMonitorId = getActiveMonitorId();
    const canUseManualPosition = Boolean(
      manualChatWindowPosition
      && (
        !activeMonitorId
        || !manualChatWindowPosition.monitorId
        || manualChatWindowPosition.monitorId === activeMonitorId
      )
    );

    if (canUseManualPosition) {
      const anchoredBounds = getOverlayChatWindowBounds({
        screen,
        width,
        height,
        displayAffinity: getActiveDisplayAffinity(),
        targetX: manualChatWindowPosition.x,
      });
      const bottomY = Math.round(Number(manualChatWindowPosition.bottomY) || 0);
      return {
        x: Math.round(anchoredBounds.x),
        y: bottomY - height,
      };
    }

    return getChatWindowBounds(width, height);
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
      displayAffinity: getActiveDisplayAffinity(),
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
      displayAffinity: getActiveDisplayAffinity(),
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
    const [width, currentHeight] = chatWindow.getSize();
    const height = Math.max(
      1,
      Number.isFinite(chatWindowHeightOverride)
        ? chatWindowHeightOverride
        : Math.round(Number(currentHeight) || 0),
    );
    const { x, y } = resolveChatWindowPositionForHeight(width, height);
    chatWindow.setPosition(x, y, false);
    positionResponseWindow();
    positionContextLabelWindow();
  }

  function resizeChatWindowForVisualAnchorHeight(anchorHeight, options = {}) {
    const chatWindow = getChatWindow();
    if (
      !chatWindow
      || chatWindow.isDestroyed?.()
      || typeof chatWindow.getSize !== 'function'
    ) {
      return false;
    }

    const [widthRaw, currentHeightRaw] = chatWindow.getSize();
    const width = Math.max(1, Math.round(Number(widthRaw) || 0));
    const currentHeight = Math.max(
      1,
      Number.isFinite(chatWindowHeightOverride)
        ? chatWindowHeightOverride
        : Math.round(Number(currentHeightRaw) || 0),
    );
    const nextHeight = getChatWindowFrameHeightForVisualAnchorHeight(anchorHeight, options);

    if (currentHeight === nextHeight) {
      return false;
    }

    if (typeof chatWindow.setBounds === 'function' && typeof chatWindow.getBounds === 'function') {
      const currentBounds = chatWindow.getBounds();
      chatWindow.setBounds({
        ...currentBounds,
        width,
        height: nextHeight,
      }, false);
      chatWindowHeightOverride = nextHeight;
      return true;
    }

    if (typeof chatWindow.setSize === 'function') {
      chatWindow.setSize(width, nextHeight, false);
      chatWindowHeightOverride = nextHeight;
      return true;
    }

    return false;
  }

  function setChatWindowBoundsForVisualAnchorHeight(anchorHeight, options = {}) {
    const chatWindow = getChatWindow();
    if (
      !chatWindow
      || chatWindow.isDestroyed?.()
      || typeof chatWindow.getSize !== 'function'
    ) {
      return false;
    }

    const [widthRaw, currentHeightRaw] = chatWindow.getSize();
    const width = Math.max(1, Math.round(Number(widthRaw) || 0));
    const nextHeight = getChatWindowFrameHeightForVisualAnchorHeight(anchorHeight, options);

    if (typeof chatWindow.setBounds === 'function' && typeof chatWindow.getBounds === 'function') {
      const currentBounds = chatWindow.getBounds();
      const normalizedCurrentBounds = {
        x: Math.round(Number(currentBounds?.x) || 0),
        y: Math.round(Number(currentBounds?.y) || 0),
        width: Math.max(1, Math.round(Number(currentBounds?.width) || width)),
        height: Math.max(
          1,
          Number.isFinite(chatWindowHeightOverride)
            ? chatWindowHeightOverride
            : Math.round(Number(currentBounds?.height) || currentHeightRaw || 0),
        ),
      };
      const currentBottom = normalizedCurrentBounds.y + normalizedCurrentBounds.height;
      const targetBounds = {
        x: normalizedCurrentBounds.x,
        y: currentBottom - nextHeight,
        width,
        height: nextHeight,
      };

      if (
        normalizedCurrentBounds.x === targetBounds.x
        && normalizedCurrentBounds.y === targetBounds.y
        && normalizedCurrentBounds.width === targetBounds.width
        && normalizedCurrentBounds.height === targetBounds.height
      ) {
        return false;
      }

      chatWindow.setBounds(targetBounds, false);
      chatWindowHeightOverride = nextHeight;
      positionResponseWindow();
      positionContextLabelWindow();
      return true;
    }

    const currentHeight = Math.max(
      1,
      Number.isFinite(chatWindowHeightOverride)
        ? chatWindowHeightOverride
        : Math.round(Number(currentHeightRaw) || 0),
    );
    if (currentHeight === nextHeight) {
      return false;
    }

    if (typeof chatWindow.setSize === 'function') {
      chatWindow.setSize(width, nextHeight, false);
      chatWindowHeightOverride = nextHeight;
      if (typeof chatWindow.setPosition === 'function') {
        const nextBounds = resolveChatWindowPositionForHeight(width, nextHeight);
        chatWindow.setPosition(Math.round(nextBounds.x), Math.round(nextBounds.y), false);
      }
      positionResponseWindow();
      positionContextLabelWindow();
      return true;
    }

    return false;
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
    const chatWindow = getChatWindow();
    const [, currentHeightRaw] = chatWindow
      && !chatWindow.isDestroyed?.()
      && typeof chatWindow.getSize === 'function'
      ? chatWindow.getSize()
      : [];
    const currentHeight = Math.max(
      1,
      Number.isFinite(chatWindowHeightOverride)
        ? chatWindowHeightOverride
        : Math.round(Number(currentHeightRaw) || 0),
    );
    manualChatWindowPosition = {
      x,
      bottomY: y + currentHeight,
      monitorId: typeof position.monitorId === 'string'
        ? position.monitorId
        : getActiveMonitorId(),
    };
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
    const height = Math.max(RESPONSE_OVERLAY_AWAITING_FRAME_HEIGHT, currentHeight || 0);
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
    resizeChatWindowForVisualAnchorHeight,
    setChatWindowBoundsForVisualAnchorHeight,
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
