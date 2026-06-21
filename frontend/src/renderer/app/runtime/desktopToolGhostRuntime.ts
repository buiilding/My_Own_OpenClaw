/**
 * Coordinates debug tool-ghost timing for the renderer app runtime.
 */

const TOOL_GHOST_CLICK_HOLD_START_MS = 1000;
const TOOL_GHOST_CLICK_MOVE_MS = 1200;
const TOOL_GHOST_CLICK_HOLD_END_MS = 1000;

const TOOL_GHOST_CLICK_SYNC_DELAY_MS = (
  TOOL_GHOST_CLICK_HOLD_START_MS
  + TOOL_GHOST_CLICK_MOVE_MS
  + TOOL_GHOST_CLICK_HOLD_END_MS
);

export function getToolGhostClickSyncDelayMs(): number {
  return TOOL_GHOST_CLICK_SYNC_DELAY_MS;
}
