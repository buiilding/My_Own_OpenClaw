/**
 * Handles overlay chatbox visual anchor events for the Electron main process.
 */

function handleSetChatboxVisualAnchorHeight(
  {
    height,
    frameHeight,
  } = {},
  deps = {},
) {
  const {
    setChatVisualAnchorHeight,
    setChatWindowBoundsForVisualAnchorHeight,
    resizeChatWindowForVisualAnchorHeight,
    positionResponseWindow,
    warn = console.warn,
  } = deps;

  const nextHeight = Math.round(Number(height));
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return {
      success: false,
      reason: 'Invalid chatbox visual anchor height',
    };
  }
  const nextFrameHeight = frameHeight == null ? null : Math.round(Number(frameHeight));
  if (frameHeight != null && (!Number.isFinite(nextFrameHeight) || nextFrameHeight <= 0)) {
    return {
      success: false,
      reason: 'Invalid chatbox native frame height',
    };
  }
  const frameOptions = nextFrameHeight == null
    ? {}
    : { frameHeight: nextFrameHeight };

  try {
    const didChange = typeof setChatVisualAnchorHeight === 'function'
      ? setChatVisualAnchorHeight(nextHeight)
      : true;
    if (didChange || nextFrameHeight != null) {
      const boundsChanged = typeof setChatWindowBoundsForVisualAnchorHeight === 'function'
        ? setChatWindowBoundsForVisualAnchorHeight(nextHeight, frameOptions)
        : false;
      const resized = !boundsChanged && typeof resizeChatWindowForVisualAnchorHeight === 'function'
        ? resizeChatWindowForVisualAnchorHeight(nextHeight, frameOptions)
        : false;
      if (!boundsChanged || resized) {
        positionResponseWindow?.();
      }
    }
    return {
      success: true,
      height: nextHeight,
      frameHeight: nextFrameHeight,
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
