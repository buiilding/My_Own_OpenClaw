function handleSetChatboxVisualAnchorHeight(
  {
    height,
  } = {},
  deps = {},
) {
  const {
    setChatVisualAnchorHeight,
    setChatWindowBoundsForVisualAnchorHeight,
    resizeChatWindowForVisualAnchorHeight,
    positionChatWindow,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    warn = console.warn,
  } = deps;

  const nextHeight = Math.round(Number(height));
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return {
      success: false,
      reason: 'Invalid chatbox visual anchor height',
    };
  }

  try {
    const didChange = typeof setChatVisualAnchorHeight === 'function'
      ? setChatVisualAnchorHeight(nextHeight)
      : true;
    const didResize = typeof setChatWindowBoundsForVisualAnchorHeight === 'function'
      ? setChatWindowBoundsForVisualAnchorHeight(nextHeight)
      : typeof resizeChatWindowForVisualAnchorHeight === 'function'
        ? resizeChatWindowForVisualAnchorHeight(nextHeight)
      : false;
    if (didResize) {
      syncContextLabelWindowVisibility?.();
      return {
        success: true,
        height: nextHeight,
        changed: Boolean(didChange),
      };
    }
    const didLegacyResize = typeof resizeChatWindowForVisualAnchorHeight === 'function'
      ? resizeChatWindowForVisualAnchorHeight(nextHeight)
      : false;
    if (didChange || didLegacyResize) {
      positionChatWindow?.();
    } else {
      positionResponseWindow?.();
      positionContextLabelWindow?.();
    }
    syncContextLabelWindowVisibility?.();
    return {
      success: true,
      height: nextHeight,
      changed: Boolean(didChange),
    };
  } catch (error) {
    warn('[Main] Failed to update chatbox visual anchor height:', error?.message || error);
    return {
      success: false,
      reason: `Failed to update chatbox visual anchor height: ${error?.message || error}`,
    };
  }
}

module.exports = {
  handleSetChatboxVisualAnchorHeight,
};
