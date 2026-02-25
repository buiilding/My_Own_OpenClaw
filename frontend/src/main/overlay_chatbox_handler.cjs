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

module.exports = {
  handleSetChatboxSize,
};
