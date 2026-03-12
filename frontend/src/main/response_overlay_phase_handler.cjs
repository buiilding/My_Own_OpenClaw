const {
  RESPONSE_OVERLAY_WINDOW_MODE,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  shouldRestoreTerminalResponseWindow,
} = require('./response_overlay_visibility_policy.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

function syncOverlayLoopInteractivity(active, deps = {}) {
  const {
    chatWindow,
    responseWindow,
    contextLabelWindow,
    getChatboxHitTestActive = () => false,
    warn = console.warn,
  } = deps;

  if (chatWindow && !chatWindow.isDestroyed()) {
    try {
      if (active || !getChatboxHitTestActive()) {
        chatWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        chatWindow.setIgnoreMouseEvents(false);
      }
    } catch (error) {
      warn('[Main] Failed to sync overlay click-through state:', error?.message || error);
    }

    try {
      if (typeof chatWindow.setFocusable === 'function') {
        chatWindow.setFocusable(!active);
      }
    } catch (error) {
      warn('[Main] Failed to sync overlay focusable state:', error?.message || error);
    }
  }

  const passiveWindows = [responseWindow, contextLabelWindow].filter(
    (win) => win && !win.isDestroyed(),
  );

  for (const win of passiveWindows) {
    try {
      if (active) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    } catch (error) {
      warn('[Main] Failed to sync overlay click-through state:', error?.message || error);
    }

    try {
      if (typeof win.setFocusable === 'function') {
        win.setFocusable(!active);
      }
    } catch (error) {
      warn('[Main] Failed to sync overlay focusable state:', error?.message || error);
    }
  }
}

function applyResponseOverlayWindowMode(mode, deps = {}) {
  const {
    setResponseOverlayVisibilityState = () => {},
    responseWindow,
    ensureResponseOverlayFallbackBounds = () => {},
    showResponseWindowWhenChatVisible = () => {},
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    phase = null,
  } = deps;

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN) {
    setResponseOverlayVisibilityState(false);
    if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
      responseWindow.hide();
    }
    logChatPillMainTrace({
      source: 'phase-handler',
      action: 'hide-response-window',
      phase,
      responseWindow,
    }, deps);
    return;
  }

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP) {
    setResponseOverlayVisibilityState(true);
    if (!responseWindow || responseWindow.isDestroyed()) {
      return;
    }
    ensureResponseOverlayFallbackBounds();
    showResponseWindowWhenChatVisible();
    logChatPillMainTrace({
      source: 'phase-handler',
      action: 'show-response-window',
      phase,
      responseWindow,
    }, deps);
    return;
  }

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL) {
    if (shouldRestoreTerminalResponseWindow(deps)) {
      showResponseWindowInactive();
      logChatPillMainTrace({
        source: 'phase-handler',
        action: 'restore-terminal-response-window',
        phase,
        responseWindow,
      }, deps);
    }
    syncContextLabelWindowVisibility();
  }
}

function handleResponseOverlayPhaseEvent(event = {}, deps = {}) {
  const {
    ENABLE_OS_TOOL_GHOST_DEBUG = false,
    RESPONSE_OVERLAY_PHASE = {},
    setResponseOverlayPhase = () => {},
    getResponseOverlayVisible = () => false,
    setResponseOverlayVisibilityState = () => {},
    responseWindow,
    chatWindow,
    contextLabelWindow,
    ensureResponseOverlayFallbackBounds = () => {},
    showResponseWindowWhenChatVisible = () => {},
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    getResponseOverlayPhase = () => null,
    getChatboxHitTestActive = () => false,
    warn = console.warn,
  } = deps;

  if (ENABLE_OS_TOOL_GHOST_DEBUG) {
    return;
  }

  const nextPhase = event?.phase;
  if (!Object.values(RESPONSE_OVERLAY_PHASE).includes(nextPhase)) {
    return;
  }

  setResponseOverlayPhase(nextPhase);
  const windowMode = resolveResponseOverlayWindowMode(nextPhase, RESPONSE_OVERLAY_PHASE);
  logChatPillMainTrace({
    source: 'phase-handler',
    action: 'phase-change',
    phase: nextPhase,
    correlationId: event?.correlation_id || null,
    reason: windowMode,
  }, {
    ...deps,
    getResponseOverlayPhase,
  });
  syncOverlayLoopInteractivity(windowMode === RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP, {
    chatWindow,
    responseWindow,
    contextLabelWindow,
    getChatboxHitTestActive,
    warn,
  });
  applyResponseOverlayWindowMode(windowMode, {
    getResponseOverlayVisible,
    setResponseOverlayVisibilityState,
    responseWindow,
    chatWindow,
    ensureResponseOverlayFallbackBounds,
    showResponseWindowWhenChatVisible,
    showResponseWindowInactive,
    syncContextLabelWindowVisibility,
    phase: nextPhase,
    getResponseOverlayPhase,
  });
}

module.exports = {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
};
