/**
 * Handles response overlay phase events for the Electron main process.
 */

const {
  RESPONSE_OVERLAY_WINDOW_MODE,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  shouldRestoreTerminalResponseWindow,
} = require('./response_overlay_visibility_policy.cjs');
const { logChatPillMainTrace } = require('../debug/chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeWindow,
} = require('../debug/live_surface_trace_runtime.cjs');
const {
  appendSurfaceVisibilityDiagnostic,
} = require('../diagnostics/app_diagnostics_runtime.cjs');
const {
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} = require('../ipc/ipc_overlay_phase_contract.cjs');

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function isResponseOverlayPreflightGuardRef(value) {
  return value === RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF;
}

function applyResponseOverlayWindowMode(mode, deps = {}) {
  const {
    setResponseOverlayVisibilityState = () => {},
    responseWindow,
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    phase = null,
    source = null,
    usePhaseVisibilityFallback = false,
    getActiveResponseOverlayGuardRef = () => null,
    setActiveResponseOverlayGuardRef = () => {},
    canShowFloatingResponseOverlay = () => true,
  } = deps;

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN) {
    const activeGuardRef = typeof getActiveResponseOverlayGuardRef === 'function'
      ? getActiveResponseOverlayGuardRef()
      : null;
    if (activeGuardRef && !isResponseOverlayPreflightGuardRef(activeGuardRef)) {
      appendSurfaceVisibilityDiagnostic({
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
      logLiveSurfaceTrace('response_overlay.window.hide_ignored', {
        source: 'phase-handler',
        reason: 'guarded-sdk-overlay',
        phase,
        overlayMode: mode,
        activeGuardRef,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      return;
    }
    if (isResponseOverlayPreflightGuardRef(activeGuardRef)) {
      setActiveResponseOverlayGuardRef(null);
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'phase-handler',
        reason: 'clear-preflight-guard-for-phase-hide',
        previousGuardRef: activeGuardRef,
        nextGuardRef: null,
        phase,
      });
    }
    setResponseOverlayVisibilityState(false);
    if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
      responseWindow.hide();
      logLiveSurfaceTrace('response_overlay.window.hide', {
        source: 'phase-handler',
        reason: 'phase-hidden',
        phase,
        overlayMode: mode,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
    }
    appendSurfaceVisibilityDiagnostic({
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
      appendSurfaceVisibilityDiagnostic({
        action: 'defer-show-to-sdk-overlay-intent',
        mode,
        phase,
        source,
        response_window_visible: safeWindowVisible(responseWindow),
      });
      logChatPillMainTrace({
        source: 'phase-handler',
        action: 'defer-response-window-to-sdk-overlay-intent',
        phase,
        responseWindow,
      }, deps);
      logLiveSurfaceTrace('phase.window_mode.resolved', {
        source: 'phase-handler',
        reason: 'defer-to-sdk-overlay-intent',
        phase,
        overlayMode: mode,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      return;
    }
    if (!canShowFloatingResponseOverlay()) {
      const activeGuardRef = typeof getActiveResponseOverlayGuardRef === 'function'
        ? getActiveResponseOverlayGuardRef()
        : null;
      if (isResponseOverlayPreflightGuardRef(activeGuardRef)) {
        setActiveResponseOverlayGuardRef(null);
        logLiveSurfaceTrace('stale_guard.changed', {
          source: 'phase-handler',
          reason: 'clear-preflight-guard-for-surface-owner',
          previousGuardRef: activeGuardRef,
          nextGuardRef: null,
          phase,
        });
      }
      setResponseOverlayVisibilityState(false);
      if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
        responseWindow.hide();
        logLiveSurfaceTrace('response_overlay.window.hide', {
          source: 'phase-handler',
          reason: 'surface-not-owner',
          phase,
          overlayMode: mode,
          responseWindow: summarizeWindow(responseWindow, 'response overlay'),
        });
      }
      syncContextLabelWindowVisibility();
      appendSurfaceVisibilityDiagnostic({
        action: 'suppress-phase-show-for-surface-owner',
        mode,
        phase,
        source,
        response_window_visible: safeWindowVisible(responseWindow),
      });
      logChatPillMainTrace({
        source: 'phase-handler',
        action: 'suppress-show-surface-not-owner',
        phase,
        responseWindow,
      }, deps);
      logLiveSurfaceTrace('response_overlay.window.show_ignored', {
        source: 'phase-handler',
        reason: 'surface-not-owner',
        phase,
        overlayMode: mode,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      return;
    }
    const activeGuardRef = typeof getActiveResponseOverlayGuardRef === 'function'
      ? getActiveResponseOverlayGuardRef()
      : null;
    if (activeGuardRef !== RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF) {
      setActiveResponseOverlayGuardRef(RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF);
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'phase-handler',
        reason: RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
        previousGuardRef: activeGuardRef,
        nextGuardRef: RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
        phase,
      });
    }
    logLiveSurfaceTrace('response_overlay.window.show_deferred', {
      source: 'phase-handler',
      reason: 'renderer-preflight-size-report-required',
      phase,
      overlayMode: mode,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
    });
    appendSurfaceVisibilityDiagnostic({
      action: 'defer-preflight-show-to-size-report',
      mode,
      phase,
      source,
      response_window_visible: safeWindowVisible(responseWindow),
    });
    logChatPillMainTrace({
      source: 'phase-handler',
      action: 'defer-response-window-to-size-report',
      phase,
      responseWindow,
    }, deps);
    return;
  }

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL) {
    if (shouldRestoreTerminalResponseWindow(deps)) {
      showResponseWindowInactive();
      logLiveSurfaceTrace('response_overlay.window.show', {
        source: 'phase-handler',
        reason: 'terminal-restore',
        phase,
        overlayMode: mode,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      appendSurfaceVisibilityDiagnostic({
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
    event?.source === RESPONSE_OVERLAY_PREFLIGHT_SOURCE
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
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    getResponseOverlayPhase = () => null,
    getActiveResponseOverlayCorrelationId = () => null,
    setActiveResponseOverlayCorrelationId = () => {},
    getActiveResponseOverlayGuardRef = () => null,
    setActiveResponseOverlayGuardRef = () => {},
    canShowFloatingResponseOverlay = () => true,
  } = deps;

  if (ENABLE_OS_TOOL_GHOST_DEBUG) {
    return;
  }

  const nextPhase = event?.phase;
  if (!Object.values(RESPONSE_OVERLAY_PHASE).includes(nextPhase)) {
    return;
  }
  logLiveSurfaceTrace('phase.received', {
    source: event?.source || 'unknown',
    phase: nextPhase,
    correlationId: normalizeResponseOverlayCorrelationId(event?.correlation_id),
  });

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
    logLiveSurfaceTrace('phase.window_mode.resolved', {
      source: 'phase-handler',
      reason: 'stale-phase-ignored',
      phase: nextPhase,
      correlationId: eventCorrelationId,
      activeCorrelationId,
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
  logLiveSurfaceTrace('phase.window_mode.resolved', {
    source: 'phase-handler',
    phase: nextPhase,
    correlationId: eventCorrelationId,
    overlayMode: windowMode,
    eventSource: event?.source || null,
    visibilityFallback: usePhaseVisibilityFallback,
  });
  applyResponseOverlayWindowMode(windowMode, {
    getResponseOverlayVisible,
    setResponseOverlayVisibilityState,
    responseWindow,
    chatWindow,
    showResponseWindowInactive,
    syncContextLabelWindowVisibility,
    phase: nextPhase,
    source: event?.source || null,
    usePhaseVisibilityFallback,
    getResponseOverlayPhase,
    getActiveResponseOverlayGuardRef,
    setActiveResponseOverlayGuardRef,
    canShowFloatingResponseOverlay,
  });
}

module.exports = {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
  isResponseOverlayPreflightGuardRef,
};
