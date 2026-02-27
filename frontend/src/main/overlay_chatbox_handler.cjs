const chatboxResizeAnchorState = new WeakMap();

function updateAnchorFromBounds(anchorState, bounds) {
  if (!anchorState || !bounds || typeof bounds !== 'object') {
    return false;
  }
  let updated = false;
  if (Number.isFinite(bounds.x)) {
    anchorState.x = Math.round(bounds.x);
    updated = true;
  }
  if (Number.isFinite(bounds.y) && Number.isFinite(bounds.height)) {
    anchorState.bottom = Math.round(bounds.y + bounds.height);
    updated = true;
  }
  return updated;
}

function getOrCreateAnchorState(chatWindow) {
  let state = chatboxResizeAnchorState.get(chatWindow);
  if (!state) {
    state = {
      x: null,
      bottom: null,
    };
    chatboxResizeAnchorState.set(chatWindow, state);
  }
  return state;
}

async function handleSetChatboxSize(
  {
    width,
    height,
  } = {},
  deps = {},
) {
  const {
    chatWindow,
    getChatWindowBounds,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
  } = deps;

  if (!chatWindow || chatWindow.isDestroyed()) {
    return { success: false, reason: 'Chat window not available' };
  }

  const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
  const nextHeight = Math.max(1, Math.min(7500, Math.round(Number(height) || 0)));
  try {
    const anchorState = getOrCreateAnchorState(chatWindow);
    const [curWidth, curHeight] = chatWindow.getSize();
    if (curWidth === nextWidth && curHeight === nextHeight) {
      return { success: true, resized: false };
    }

    // Keep bottom fixed and preserve x across resize bursts.
    let fallbackBounds = null;
    const currentBounds = typeof chatWindow.getBounds === 'function'
      ? chatWindow.getBounds()
      : null;
    const hasAnchorX = Number.isFinite(anchorState.x);
    const hasAnchorBottom = Number.isFinite(anchorState.bottom);
    if (!hasAnchorX || !hasAnchorBottom) {
      updateAnchorFromBounds(anchorState, currentBounds);
    }
    if (anchorState.x == null || anchorState.bottom == null) {
      fallbackBounds = getChatWindowBounds(nextWidth, nextHeight);
      if (anchorState.x == null && Number.isFinite(fallbackBounds?.x)) {
        anchorState.x = Math.round(fallbackBounds.x);
      }
      if (anchorState.bottom == null && Number.isFinite(fallbackBounds?.y)) {
        anchorState.bottom = Math.round(fallbackBounds.y + nextHeight);
      }
    }
    const nextX = Number.isFinite(anchorState.x)
      ? anchorState.x
      : Math.round(fallbackBounds?.x || 0);
    const nextBottom = Number.isFinite(anchorState.bottom)
      ? anchorState.bottom
      : Math.round((fallbackBounds?.y || 0) + nextHeight);
    const bounds = {
      x: nextX,
      y: Math.round(nextBottom - nextHeight),
      width: nextWidth,
      height: nextHeight,
    };

    chatWindow.setBounds(bounds, false);
    const appliedBounds = typeof chatWindow.getBounds === 'function'
      ? chatWindow.getBounds()
      : null;
    if (!updateAnchorFromBounds(anchorState, appliedBounds)) {
      anchorState.x = bounds.x;
      anchorState.bottom = bounds.y + bounds.height;
    }
    positionResponseWindow();
    positionContextLabelWindow();
    syncContextLabelWindowVisibility();
    return { success: true, resized: true, width: nextWidth, height: nextHeight };
  } catch (error) {
    return { success: false, reason: `Failed to resize chatbox: ${error.message}` };
  }
}

function handleMoveChatboxTo(
  {
    x,
    y,
  } = {},
  deps = {},
) {
  const {
    chatWindow,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    warn = console.warn,
  } = deps;

  if (!chatWindow || chatWindow.isDestroyed()) {
    return;
  }

  const nextX = Math.round(Number(x));
  const nextY = Math.round(Number(y));
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    return;
  }

  try {
    const [, curHeight] = typeof chatWindow.getSize === 'function'
      ? chatWindow.getSize()
      : [null, null];
    const anchorState = getOrCreateAnchorState(chatWindow);
    anchorState.x = nextX;
    if (Number.isFinite(curHeight)) {
      anchorState.bottom = nextY + curHeight;
    }
    chatWindow.setPosition(nextX, nextY, false);
    positionResponseWindow();
    positionContextLabelWindow();
    syncContextLabelWindowVisibility();
  } catch (error) {
    warn('[Main] Failed to move chatbox:', error?.message || error);
  }
}

module.exports = {
  handleMoveChatboxTo,
  handleSetChatboxSize,
};
