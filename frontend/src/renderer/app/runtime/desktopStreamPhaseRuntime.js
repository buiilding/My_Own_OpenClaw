/**
 * Provides the stream phase state module for the renderer UI.
 */

import { DesktopResponseOverlayPhaseRuntime } from './desktopResponseOverlayPhaseRuntime';

const {
  getAwaitingFirstChunkResponseOverlayPhase,
  getToolCallResponseOverlayPhase,
  getToolOutputResponseOverlayPhase,
} = DesktopResponseOverlayPhaseRuntime;

const OVERLAY_AWAITING_REPLY_PHASES = Object.freeze([
  getAwaitingFirstChunkResponseOverlayPhase(),
  getToolCallResponseOverlayPhase(),
  getToolOutputResponseOverlayPhase(),
]);

const OVERLAY_AWAITING_REPLY_PHASE_SET = new Set(OVERLAY_AWAITING_REPLY_PHASES);

export function isOverlayAwaitingReplyPhase(phase) {
  return typeof phase === 'string' && OVERLAY_AWAITING_REPLY_PHASE_SET.has(phase);
}
