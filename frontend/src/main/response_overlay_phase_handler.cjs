const {
  RESPONSE_OVERLAY_WINDOW_MODE,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  shouldRestoreTerminalResponseWindow,
} = require('./response_overlay_visibility_policy.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

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
    source = null,
    usePhaseVisibilityFallback = false,
    getActiveResponseOverlayGuardRef = () => null,
  } = deps;

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN) {
    const activeGuardRef = typeof getActiveResponseOverlayGuardRef === 'function'
      ? getActiveResponseOverlayGuardRef()
      : null;
    if (activeGuardRef) {
      console.log('[ResponseOverlayWindow][main]', {
        action: 'ignore-hide-from-phase-for-guarded-sdk-overlay',
        mode,
        phase,
        active_guard_ref: activeGuardRef,
        response_window_visible: safeWindowVisible(responseWindow),
      });
      logChatPillMainTrace({
        source: 'phase-handler',
        action: 'ignore-hide-for-guarded-sdk-overlay',
        phase,
        responseWindow,
        activeGuardRef,
      }, deps);
      return;
    }
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
    if (usePhaseVisibilityFallback !== true) {
      console.log('[ResponseOverlayWindow][main]', {
        action: 'defer-show-to-renderer',
        mode,
        phase,
        source,
        response_window_visible: safeWindowVisible(responseWindow),
      });
      logChatPillMainTrace({
        source: 'phase-handler',
        action: 'defer-response-window-to-renderer',
        phase,
        responseWindow,
      }, deps);
      return;
    }
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
      source,
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

function shouldUsePhaseVisibilityFallback(event = {}, nextPhase, RESPONSE_OVERLAY_PHASE = {}) {
  return (
    event?.source === 'renderer-send-preflight'
    && nextPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK
  );
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
    ensureResponseOverlayFallbackBounds = () => {},
    showResponseWindowWhenChatVisible = () => {},
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    getResponseOverlayPhase = () => null,
    getActiveResponseOverlayCorrelationId = () => null,
    setActiveResponseOverlayCorrelationId = () => {},
    getActiveResponseOverlayGuardRef = () => null,
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
  const usePhaseVisibilityFallback = shouldUsePhaseVisibilityFallback(
    event,
    nextPhase,
    RESPONSE_OVERLAY_PHASE,
  );
  logChatPillMainTrace({
    source: 'phase-handler',
    action: 'phase-change',
    phase: nextPhase,
    correlationId: eventCorrelationId,
    reason: windowMode,
    eventSource: event?.source || null,
    visibilityFallback: usePhaseVisibilityFallback,
  }, {
    ...deps,
    getResponseOverlayPhase,
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
    source: event?.source || null,
    usePhaseVisibilityFallback,
    getResponseOverlayPhase,
    getActiveResponseOverlayGuardRef,
  });
}

module.exports = {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
};
