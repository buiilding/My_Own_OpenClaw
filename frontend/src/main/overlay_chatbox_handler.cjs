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
};
