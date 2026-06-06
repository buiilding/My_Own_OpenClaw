const responseOverlayLayoutContract = require('../shared/response_overlay_layout_contract.json');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
  summarizeWindow,
} = require('./live_surface_trace_runtime.cjs');
const {
  safeSetResponseOverlayHitTest,
} = require('./response_overlay_hit_test_runtime.cjs');

const RESPONSE_OVERLAY_WIDTH = 520;
const RESPONSE_OVERLAY_AWAITING_HEIGHT = (
  Number(responseOverlayLayoutContract?.awaiting_frame_height) || 24
);
const RESPONSE_OVERLAY_RESPONSE_HEIGHT = (
  Number(responseOverlayLayoutContract?.response_fixed_height) || 236
);

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function resolveOverlayIntent(currentTurn) {
  const presentation = currentTurn?.presentation;
  const intent = presentation?.overlayIntent;
  if (!intent || typeof intent !== 'object') {
    return null;
  }
  const mode = normalizeString(intent.mode);
  if (mode !== 'awaiting' && mode !== 'response' && mode !== 'hidden') {
    return null;
  }
  const turnRef = normalizeString(intent.turnRef) || normalizeString(currentTurn?.turnRef);
  return {
    visible: intent.visible === true,
    mode,
    turnRef,
    staleGuardRef: normalizeString(intent.staleGuardRef) || turnRef,
    conversationRef: normalizeString(intent.conversationRef)
      || normalizeString(presentation?.conversationRef)
      || normalizeString(currentTurn?.conversationRef),
  };
}

function responseBoundsForIntent(intent, getResponseWindowBounds) {
  const compactHover = intent.mode === 'awaiting';
  const height = compactHover
    ? RESPONSE_OVERLAY_AWAITING_HEIGHT
    : RESPONSE_OVERLAY_RESPONSE_HEIGHT;
  return getResponseWindowBounds(RESPONSE_OVERLAY_WIDTH, height, { compactHover });
}

function createSdkLiveTurnSurfaceState() {
  return {
    lastAppliedOverlayIntentSignature: null,
    lastTypingTrace: null,
  };
}

function buildVisibleIntentSignature(intent, bounds) {
  return JSON.stringify({
    visible: true,
    mode: intent.mode,
    turnRef: intent.turnRef,
    staleGuardRef: intent.staleGuardRef,
    x: Number(bounds?.x) || 0,
    y: Number(bounds?.y) || 0,
    width: Number(bounds?.width) || 0,
    height: Number(bounds?.height) || 0,
  });
}

function buildHiddenIntentSignature(intent) {
  return JSON.stringify({
    visible: false,
    mode: intent.mode,
    turnRef: intent.turnRef,
    staleGuardRef: intent.staleGuardRef,
  });
}

function shouldIgnoreSdkHide({ activeGuardRef, staleGuardRef }) {
  if (!activeGuardRef) {
    return false;
  }
  if (!staleGuardRef) {
    return true;
  }
  return staleGuardRef !== activeGuardRef;
}

function logSdkTypingTransition(currentTurn, intent, state = null) {
  const presentation = currentTurn?.presentation;
  if (!presentation || typeof presentation.typingVisible !== 'boolean') {
    return;
  }
  const surfaceState = state || createSdkLiveTurnSurfaceState();
  const turnSummary = summarizeCurrentTurn(currentTurn);
  const nextTrace = {
    visible: presentation.typingVisible === true,
    turnRef: turnSummary.turnRef,
    conversationRef: turnSummary.conversationRef,
  };
  const previousTrace = surfaceState.lastTypingTrace || null;
  if (
    previousTrace
    && previousTrace.visible === nextTrace.visible
    && previousTrace.turnRef === nextTrace.turnRef
    && previousTrace.conversationRef === nextTrace.conversationRef
  ) {
    return;
  }
  surfaceState.lastTypingTrace = nextTrace;

  if (!nextTrace.visible && previousTrace?.visible !== true) {
    return;
  }

  logLiveSurfaceTrace(nextTrace.visible ? 'typing.show' : 'typing.hide', {
    source: 'sdk-live-turn-surface',
    reason: nextTrace.visible ? 'sdk-current-turn-typing-visible' : 'sdk-current-turn-typing-hidden',
    turnRef: turnSummary.turnRef,
    conversationRef: turnSummary.conversationRef,
    phase: turnSummary.phase,
    overlayMode: turnSummary.overlayMode || intent?.mode || null,
    guardRef: turnSummary.guardRef || intent?.staleGuardRef || null,
    typingVisible: turnSummary.typingVisible,
    overlayVisible: turnSummary.overlayVisible,
    hasVisibleContent: turnSummary.hasVisibleContent,
    entryCount: turnSummary.entryCount,
    assistantLength: turnSummary.assistantLength,
    reasoningLength: turnSummary.reasoningLength,
    toolEventCount: turnSummary.toolEventCount,
  });
}

function handleSdkLiveTurnSurfaceIntent(currentTurn, deps = {}) {
  const {
    responseWindow,
    getResponseWindowBounds,
    getResponseOverlayVisible = () => false,
    getResponseOverlayPhase = () => null,
    getActiveResponseOverlayGuardRef = () => null,
    setActiveResponseOverlayGuardRef = () => {},
    setResponseOverlayVisibilityState = () => {},
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
    surfaceState = null,
    log = console.log,
  } = deps;

  const sdkSurfaceState = surfaceState || createSdkLiveTurnSurfaceState();

  if (!responseWindow || responseWindow.isDestroyed?.()) {
    return { success: false, reason: 'response-window-unavailable' };
  }
  if (typeof getResponseWindowBounds !== 'function') {
    return { success: false, reason: 'response-bounds-unavailable' };
  }

  const intent = resolveOverlayIntent(currentTurn);
  if (!intent) {
    logLiveSurfaceTrace('response_overlay.intent.ignored', {
      ...summarizeCurrentTurn(currentTurn),
      source: 'sdk-live-turn-surface',
      reason: 'missing-sdk-overlay-intent',
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
    });
    return { success: true, applied: false, reason: 'missing-sdk-overlay-intent' };
  }

  logSdkTypingTransition(currentTurn, intent, sdkSurfaceState);

  const activeGuardRef = normalizeString(getActiveResponseOverlayGuardRef());
  if (!intent.visible || intent.mode === 'hidden') {
    const hiddenSignature = buildHiddenIntentSignature(intent);
    if (
      sdkSurfaceState.lastAppliedOverlayIntentSignature === hiddenSignature
      && safeWindowVisible(responseWindow) === false
      && getResponseOverlayVisible() === false
    ) {
      return {
        success: true,
        applied: false,
        ignored: true,
        reason: 'idempotent-hidden-intent',
        visible: false,
      };
    }
    if (shouldIgnoreSdkHide({
      activeGuardRef,
      staleGuardRef: intent.staleGuardRef,
    })) {
      log('[ResponseOverlayWindow][main]', {
        action: 'ignore-hide-from-sdk-overlay-intent',
        phase: getResponseOverlayPhase(),
        mode: intent.mode,
        turn_ref: intent.turnRef,
        stale_guard_ref: intent.staleGuardRef,
        active_guard_ref: activeGuardRef,
        response_window_visible: safeWindowVisible(responseWindow),
        response_overlay_visible_flag: getResponseOverlayVisible(),
      });
      logChatPillMainTrace({
        source: 'sdk-live-turn-surface',
        action: 'ignore-stale-hide',
        phase: getResponseOverlayPhase(),
        responseWindow,
        responseOverlayVisibleFlag: getResponseOverlayVisible(),
        turnRef: intent.turnRef,
        staleGuardRef: intent.staleGuardRef,
        activeGuardRef,
      }, deps);
      logLiveSurfaceTrace('response_overlay.intent.ignored', {
        source: 'sdk-live-turn-surface',
        reason: 'stale-hide',
        turnRef: intent.turnRef,
        conversationRef: intent.conversationRef,
        phase: getResponseOverlayPhase(),
        overlayMode: intent.mode,
        guardRef: intent.staleGuardRef,
        activeGuardRef,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      return { success: true, applied: false, ignored: true, reason: 'stale-hide' };
    }
    setResponseOverlayVisibilityState(false);
    if (!intent.staleGuardRef || intent.staleGuardRef === activeGuardRef) {
      setActiveResponseOverlayGuardRef(null);
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'sdk-live-turn-surface',
        reason: 'sdk-overlay-hide',
        previousGuardRef: activeGuardRef,
        nextGuardRef: null,
        turnRef: intent.turnRef,
        conversationRef: intent.conversationRef,
      });
    }
    safeSetResponseOverlayHitTest(responseWindow, {
      ignoreMouseEvents: true,
      source: 'sdk-live-turn-surface',
      reason: 'sdk-overlay-hide',
      turnRef: intent.turnRef,
      conversationRef: intent.conversationRef,
      guardRef: intent.staleGuardRef,
      phase: getResponseOverlayPhase(),
      overlayMode: intent.mode,
    });
    if (responseWindow.isVisible?.()) {
      responseWindow.hide();
      logLiveSurfaceTrace('response_overlay.window.hide', {
        source: 'sdk-live-turn-surface',
        reason: 'sdk-overlay-intent',
        turnRef: intent.turnRef,
        conversationRef: intent.conversationRef,
        phase: getResponseOverlayPhase(),
        overlayMode: intent.mode,
        guardRef: intent.staleGuardRef,
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
    }
    syncContextLabelWindowVisibility();
    log('[ResponseOverlayWindow][main]', {
      action: 'hide-from-sdk-overlay-intent',
      phase: getResponseOverlayPhase(),
      mode: intent.mode,
      turn_ref: intent.turnRef,
      stale_guard_ref: intent.staleGuardRef,
      response_window_visible: safeWindowVisible(responseWindow),
      response_overlay_visible_flag: getResponseOverlayVisible(),
    });
    logLiveSurfaceTrace('response_overlay.intent.hide', {
      source: 'sdk-live-turn-surface',
      turnRef: intent.turnRef,
      conversationRef: intent.conversationRef,
      phase: getResponseOverlayPhase(),
      overlayMode: intent.mode,
      guardRef: intent.staleGuardRef,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      responseOverlayVisible: getResponseOverlayVisible(),
    });
    sdkSurfaceState.lastAppliedOverlayIntentSignature = hiddenSignature;
    return { success: true, applied: true, visible: false };
  }

  const bounds = responseBoundsForIntent(intent, getResponseWindowBounds);
  const visibleSignature = buildVisibleIntentSignature(intent, bounds);
  if (
    sdkSurfaceState.lastAppliedOverlayIntentSignature === visibleSignature
    && safeWindowVisible(responseWindow) === true
    && getResponseOverlayVisible() === true
    && (!intent.staleGuardRef || activeGuardRef === intent.staleGuardRef)
  ) {
    logLiveSurfaceTrace('response_overlay.intent.noop', {
      source: 'sdk-live-turn-surface',
      reason: 'idempotent-sdk-overlay-intent',
      turnRef: intent.turnRef,
      conversationRef: intent.conversationRef,
      phase: getResponseOverlayPhase(),
      overlayMode: intent.mode,
      guardRef: intent.staleGuardRef,
      width: bounds.width,
      height: bounds.height,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
    });
    return {
      success: true,
      applied: false,
      ignored: true,
      reason: 'idempotent-visible-intent',
      visible: true,
      mode: intent.mode,
      turnRef: intent.turnRef,
      staleGuardRef: intent.staleGuardRef,
    };
  }
  responseWindow.setBounds(bounds, false);
  logLiveSurfaceTrace('response_overlay.window.resize', {
    source: 'sdk-live-turn-surface',
    reason: 'sdk-overlay-intent',
    turnRef: intent.turnRef,
    conversationRef: intent.conversationRef,
    phase: getResponseOverlayPhase(),
    overlayMode: intent.mode,
    guardRef: intent.staleGuardRef,
    width: bounds.width,
    height: bounds.height,
    responseWindow: summarizeWindow(responseWindow, 'response overlay'),
  });
  if (intent.staleGuardRef) {
    setActiveResponseOverlayGuardRef(intent.staleGuardRef);
    if (intent.staleGuardRef !== activeGuardRef) {
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'sdk-live-turn-surface',
        reason: 'sdk-overlay-show',
        previousGuardRef: activeGuardRef,
        nextGuardRef: intent.staleGuardRef,
        turnRef: intent.turnRef,
        conversationRef: intent.conversationRef,
      });
    }
  }
  setResponseOverlayVisibilityState(true);
  showResponseWindowInactive();
  logLiveSurfaceTrace('response_overlay.window.show', {
    source: 'sdk-live-turn-surface',
    reason: 'sdk-overlay-intent',
    turnRef: intent.turnRef,
    conversationRef: intent.conversationRef,
    phase: getResponseOverlayPhase(),
    overlayMode: intent.mode,
    guardRef: intent.staleGuardRef,
    responseWindow: summarizeWindow(responseWindow, 'response overlay'),
  });
  syncContextLabelWindowVisibility();
  log('[ResponseOverlayWindow][main]', {
    action: 'show-from-sdk-overlay-intent',
    phase: getResponseOverlayPhase(),
    mode: intent.mode,
    turn_ref: intent.turnRef,
    stale_guard_ref: intent.staleGuardRef,
    response_window_visible: safeWindowVisible(responseWindow),
    response_overlay_visible_flag: getResponseOverlayVisible(),
    width: bounds.width,
    height: bounds.height,
  });
  logChatPillMainTrace({
    source: 'sdk-live-turn-surface',
    action: 'show',
    phase: getResponseOverlayPhase(),
    responseWindow,
    responseOverlayVisibleFlag: getResponseOverlayVisible(),
    responseLayoutMode: intent.mode === 'awaiting' ? 'awaiting-typing' : 'response',
    turnRef: intent.turnRef,
    staleGuardRef: intent.staleGuardRef,
  }, deps);
  logLiveSurfaceTrace(
    intent.mode === 'awaiting'
      ? 'response_overlay.intent.show_awaiting'
      : 'response_overlay.intent.show_response',
    {
      source: 'sdk-live-turn-surface',
      turnRef: intent.turnRef,
      conversationRef: intent.conversationRef,
      phase: getResponseOverlayPhase(),
      overlayMode: intent.mode,
      guardRef: intent.staleGuardRef,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      responseOverlayVisible: getResponseOverlayVisible(),
      width: bounds.width,
      height: bounds.height,
    },
  );
  sdkSurfaceState.lastAppliedOverlayIntentSignature = visibleSignature;
  return {
    success: true,
    applied: true,
    visible: true,
    mode: intent.mode,
    turnRef: intent.turnRef,
    staleGuardRef: intent.staleGuardRef,
  };
}

module.exports = {
  createSdkLiveTurnSurfaceState,
  handleSdkLiveTurnSurfaceIntent,
  logSdkTypingTransition,
  resolveOverlayIntent,
};
