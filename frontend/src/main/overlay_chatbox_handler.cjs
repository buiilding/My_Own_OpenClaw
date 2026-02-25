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
    const [curWidth, curHeight] = chatWindow.getSize();
    if (curWidth === nextWidth && curHeight === nextHeight) {
      return { success: true, resized: false };
    }

    // Apply size+position atomically to keep the chat input pill anchored.
    const bounds = getChatWindowBounds(nextWidth, nextHeight);
    chatWindow.setBounds(bounds, false);
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
