export const RESPONSE_OVERLAY_LAYOUT_MODE = Object.freeze({
  HIDDEN: 'hidden',
  RESPONSE: 'response',
  AWAITING_TYPING: 'awaiting-typing',
});

export function resolveResponseOverlayLayoutMode({
  showResponse,
  showAwaitingReply,
}) {
  if (showResponse) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE;
  }
  if (!showAwaitingReply) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
  }
  return RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING;
}

export function isCompactHoverLayoutMode(layoutMode) {
  return layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING;
}
