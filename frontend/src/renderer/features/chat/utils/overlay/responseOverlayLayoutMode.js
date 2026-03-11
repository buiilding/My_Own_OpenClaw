export const RESPONSE_OVERLAY_LAYOUT_MODE = Object.freeze({
  HIDDEN: 'hidden',
  RESPONSE: 'response',
});

export function resolveResponseOverlayLayoutMode({
  showResponse,
}) {
  if (showResponse) {
    return RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE;
  }
  return RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
}
