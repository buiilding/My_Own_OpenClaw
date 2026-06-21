/**
 * Coordinates renderer response-overlay layout constants and frame helpers.
 */

import layoutContract from '../../../shared/response_overlay_layout_contract.json';

const RESPONSE_OVERLAY_LAYOUT = Object.freeze({
  AWAITING_FRAME_HEIGHT: Number(layoutContract?.awaiting_frame_height) || 24,
  RESPONSE_FIXED_HEIGHT: Number(layoutContract?.response_fixed_height) || 236,
});

const RESPONSE_OVERLAY_LAYOUT_MODE = Object.freeze({
  HIDDEN: 'hidden',
  RESPONSE: 'response',
  AWAITING_TYPING: 'awaiting-typing',
});

function resolveResponseOverlayLayoutMode({
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

function isCompactHoverLayoutMode(layoutMode) {
  return layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING;
}

function isVisibleResponseOverlayLayoutMode(layoutMode) {
  return layoutMode !== RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
}

function isAwaitingResponseOverlayLayoutMode(layoutMode) {
  return layoutMode === RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING;
}

function getHiddenResponseOverlayLayoutMode() {
  return RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;
}

function getResponseOverlayAwaitingFrameHeight() {
  return RESPONSE_OVERLAY_LAYOUT.AWAITING_FRAME_HEIGHT;
}

function getResponseOverlayFixedHeight() {
  return RESPONSE_OVERLAY_LAYOUT.RESPONSE_FIXED_HEIGHT;
}

function resolveResponseOverlayNativeMode(layoutMode) {
  return isAwaitingResponseOverlayLayoutMode(layoutMode) ? 'awaiting' : 'response';
}

function getRoundedFrameSize(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) {
    return null;
  }
  const rectWidth = Number(rect.width) || 0;
  const rectHeight = Number(rect.height) || 0;
  const scrollWidth = Number(element?.scrollWidth) || 0;
  const scrollHeight = Number(element?.scrollHeight) || 0;
  const offsetWidth = Number(element?.offsetWidth) || 0;
  const offsetHeight = Number(element?.offsetHeight) || 0;
  return {
    // Use ceil + structural box metrics to avoid 1px under-measure clipping.
    width: Math.max(1, Math.ceil(Math.max(rectWidth, scrollWidth, offsetWidth))),
    height: Math.max(1, Math.ceil(Math.max(rectHeight, scrollHeight, offsetHeight))),
  };
}

export const DesktopResponseOverlayLayoutRuntime = Object.freeze({
  resolveResponseOverlayLayoutMode,
  isCompactHoverLayoutMode,
  isVisibleResponseOverlayLayoutMode,
  isAwaitingResponseOverlayLayoutMode,
  getHiddenResponseOverlayLayoutMode,
  getResponseOverlayAwaitingFrameHeight,
  getResponseOverlayFixedHeight,
  resolveResponseOverlayNativeMode,
  getRoundedFrameSize,
});
