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

type ToolGhostTimerRef = {
  current: ReturnType<typeof setTimeout> | null;
};

type ToolGhostTimerApi = {
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

function getToolGhostClickSyncDelayMs(): number {
  return TOOL_GHOST_CLICK_SYNC_DELAY_MS;
}

function clearToolGhostTimer({
  timerRef,
  timerApi = globalThis,
}: {
  timerRef?: ToolGhostTimerRef;
  timerApi?: ToolGhostTimerApi;
}): void {
  if (!timerRef || timerRef.current == null) {
    return;
  }
  if (typeof timerApi?.clearTimeout === 'function') {
    timerApi.clearTimeout(timerRef.current);
  }
  timerRef.current = null;
}

function scheduleToolGhostTimer({
  timerRef,
  callback,
  delayMs = 0,
  timerApi = globalThis,
}: {
  timerRef?: ToolGhostTimerRef;
  callback?: () => void;
  delayMs?: number;
  timerApi?: ToolGhostTimerApi;
}): ReturnType<typeof setTimeout> | null {
  if (!timerRef || typeof callback !== 'function') {
    return null;
  }

  clearToolGhostTimer({ timerRef, timerApi });

  if (
    typeof timerApi?.setTimeout !== 'function'
    || typeof timerApi?.clearTimeout !== 'function'
  ) {
    timerRef.current = null;
    callback();
    return null;
  }

  timerRef.current = timerApi.setTimeout(() => {
    timerRef.current = null;
    callback();
  }, delayMs);

  return timerRef.current;
}

export const DesktopToolGhostRuntime = Object.freeze({
  clearToolGhostTimer,
  getToolGhostClickSyncDelayMs,
  scheduleToolGhostTimer,
});
