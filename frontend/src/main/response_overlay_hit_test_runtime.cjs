const {
  logLiveSurfaceTrace,
  summarizeWindow,
} = require('./live_surface_trace_runtime.cjs');

function safeSetResponseOverlayHitTest(
  responseWindow,
  {
    ignoreMouseEvents,
    source = 'response-overlay-hit-test',
    reason = 'response-overlay-policy',
    phase = null,
    overlayMode = null,
    turnRef = null,
    conversationRef = null,
    guardRef = null,
    warn = console.warn,
  } = {},
) {
  if (
    !responseWindow
    || typeof responseWindow !== 'object'
    || typeof responseWindow.isDestroyed !== 'function'
    || responseWindow.isDestroyed()
    || typeof responseWindow.setIgnoreMouseEvents !== 'function'
    || typeof ignoreMouseEvents !== 'boolean'
  ) {
    return false;
  }

  try {
    if (ignoreMouseEvents) {
      responseWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      responseWindow.setIgnoreMouseEvents(false);
    }
    logLiveSurfaceTrace('response_overlay.hit_test.set', {
      source,
      reason,
      ignoreMouseEvents,
      forward: ignoreMouseEvents,
      phase,
      overlayMode,
      turnRef,
      conversationRef,
      guardRef,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
    });
    return true;
  } catch (error) {
    warn('[Main] Failed to apply response overlay hit-test policy:', error?.message || error);
    return false;
  }
}

module.exports = {
  safeSetResponseOverlayHitTest,
};
