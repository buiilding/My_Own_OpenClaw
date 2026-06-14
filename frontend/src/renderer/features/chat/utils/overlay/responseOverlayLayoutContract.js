/**
 * Defines response overlay layout contract contracts for the renderer UI.
 */

import responseOverlayLayoutContract from '../../../../../shared/response_overlay_layout_contract.json';

export const RESPONSE_OVERLAY_LAYOUT = Object.freeze({
  AWAITING_FRAME_HEIGHT: Number(responseOverlayLayoutContract?.awaiting_frame_height) || 24,
  RESPONSE_FIXED_HEIGHT: Number(responseOverlayLayoutContract?.response_fixed_height) || 236,
});
