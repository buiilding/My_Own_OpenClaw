/**
 * Provides the stream phase state module for the renderer UI.
 */

import { RESPONSE_OVERLAY_PHASE } from '../overlay/responseOverlayPhaseContract';

const OVERLAY_AWAITING_REPLY_PHASES = Object.freeze([
  RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
  RESPONSE_OVERLAY_PHASE.TOOL_CALL,
  RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT,
]);

const OVERLAY_AWAITING_REPLY_PHASE_SET = new Set(OVERLAY_AWAITING_REPLY_PHASES);

export function isOverlayAwaitingReplyPhase(phase) {
  return typeof phase === 'string' && OVERLAY_AWAITING_REPLY_PHASE_SET.has(phase);
}
