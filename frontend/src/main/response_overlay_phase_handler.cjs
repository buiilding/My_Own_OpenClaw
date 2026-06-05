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
      if (!getChatboxHitTestActive()) {
        chatWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        chatWindow.setIgnoreMouseEvents(false);
      }
    } catch (error) {
      warn('[Main] Failed to sync overlay click-through state:', error?.message || error);
    }

    try {
      if (typeof chatWindow.setFocusable === 'function') {
        chatWindow.setFocusable(getChatboxHitTestActive());
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

function syncOverlayContentProtection(enabled, deps = {}) {
  const {
    chatWindow,
    responseWindow,
    applyOverlayContentProtection = () => {},
  } = deps;

  for (const [targetWindow, windowLabel] of [
    [chatWindow, 'chat box'],
    [responseWindow, 'response overlay'],
  ]) {
    if (!targetWindow || targetWindow.isDestroyed()) {
      continue;
    }
    applyOverlayContentProtection({
      targetWindow,
      windowLabel,
      enabled,
    });
  }
}

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
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
    console.log('[ResponseOverlayWindow][main]', {
      action: 'hide-from-phase',
      mode,
      phase,
      response_window_visible: safeWindowVisible(responseWindow),
    });
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
    console.log('[ResponseOverlayWindow][main]', {
      action: 'show-from-phase',
      mode,
      phase,
      response_window_visible: safeWindowVisible(responseWindow),
    });
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
      console.log('[ResponseOverlayWindow][main]', {
        action: 'restore-terminal-from-phase',
        mode,
        phase,
        response_window_visible: safeWindowVisible(responseWindow),
      });
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

function normalizeResponseOverlayCorrelationId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function shouldApplyResponseOverlayPhaseEvent({
  nextPhase,
  eventCorrelationId,
  activeCorrelationId,
  RESPONSE_OVERLAY_PHASE,
}) {
  if (!activeCorrelationId || eventCorrelationId === activeCorrelationId) {
    return true;
  }
  if (!eventCorrelationId) {
    return isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE);
  }
  return isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE);
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
    getActiveResponseOverlayCorrelationId = () => null,
    setActiveResponseOverlayCorrelationId = () => {},
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

  const eventCorrelationId = normalizeResponseOverlayCorrelationId(event?.correlation_id);
  const activeCorrelationId = normalizeResponseOverlayCorrelationId(
    getActiveResponseOverlayCorrelationId(),
  );
  if (!shouldApplyResponseOverlayPhaseEvent({
    nextPhase,
    eventCorrelationId,
    activeCorrelationId,
    RESPONSE_OVERLAY_PHASE,
  })) {
    logChatPillMainTrace({
      source: 'phase-handler',
      action: 'ignore-stale-phase',
      phase: nextPhase,
      correlationId: eventCorrelationId,
      reason: activeCorrelationId,
    }, {
      ...deps,
      getResponseOverlayPhase,
    });
    return;
  }

  if (eventCorrelationId && isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE)) {
    setActiveResponseOverlayCorrelationId(eventCorrelationId);
  } else if (
    eventCorrelationId
    && activeCorrelationId === eventCorrelationId
    && !isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE)
  ) {
    setActiveResponseOverlayCorrelationId(null);
  } else if (!eventCorrelationId && !activeCorrelationId && !isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE)) {
    setActiveResponseOverlayCorrelationId(null);
  }

  setResponseOverlayPhase(nextPhase);
  const windowMode = resolveResponseOverlayWindowMode(nextPhase, RESPONSE_OVERLAY_PHASE);
  logChatPillMainTrace({
    source: 'phase-handler',
    action: 'phase-change',
    phase: nextPhase,
    correlationId: eventCorrelationId,
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
  syncOverlayContentProtection(windowMode === RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP, {
    chatWindow,
    responseWindow,
    applyOverlayContentProtection: deps.applyOverlayContentProtection,
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
