export const RESPONSE_OVERLAY_LAYOUT_MODE = Object.freeze({
  HIDDEN: 'hidden',
  RESPONSE: 'response',
  AWAITING_TYPING: 'awaiting-typing',
  AWAITING_THINKING: 'awaiting-thinking',
});

export function resolveResponseOverlayLayoutMode({
  showResponse,
  showAwaitingReply,
  thinkingText,
}) {
  if (showResponse) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE;
  }
  if (!showAwaitingReply) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
  }
  if (typeof thinkingText === 'string' && thinkingText.trim().length > 0) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_THINKING;
  }
  return RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING;
}

export function isCompactHoverLayoutMode(layoutMode) {
  return (
    layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING
    || layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_THINKING
  );
}
