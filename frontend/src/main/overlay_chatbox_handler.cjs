function handleMoveChatboxTo(
  {
    x,
    y,
  } = {},
  deps = {},
) {
  const {
    screen,
    chatWindow,
    resolveDisplayAffinityForBounds = () => null,
    setActiveDisplayAffinity = () => {},
    setManualChatWindowPosition = () => {},
    positionChatWindow,
    syncWindowDisplayAffinity = () => {},
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
    const [windowWidth = 0, windowHeight = 0] = typeof chatWindow.getSize === 'function'
      ? chatWindow.getSize()
      : [];
    const targetDisplayAffinity = resolveDisplayAffinityForBounds(screen, {
      x: nextX,
      y: nextY,
      width: Math.max(1, Math.round(Number(windowWidth) || 0)),
      height: Math.max(1, Math.round(Number(windowHeight) || 0)),
    });

    if (targetDisplayAffinity) {
      setActiveDisplayAffinity(targetDisplayAffinity);
    }

    setManualChatWindowPosition({
      x: nextX,
      monitorId: targetDisplayAffinity?.monitor_id ?? null,
    });

    if (typeof positionChatWindow === 'function') {
      positionChatWindow();
    } else {
      chatWindow.setPosition(nextX, nextY, false);
      positionResponseWindow?.();
      positionContextLabelWindow?.();
    }

    syncWindowDisplayAffinity(chatWindow);
    syncContextLabelWindowVisibility();
  } catch (error) {
    warn('[Main] Failed to move chatbox:', error?.message || error);
  }
}

module.exports = {
  handleMoveChatboxTo,
};
