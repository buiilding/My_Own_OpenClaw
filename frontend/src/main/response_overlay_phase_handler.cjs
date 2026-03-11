function isStreamingResponseOverlayPhase(phase, phaseEnum = {}) {
  return (
    phase === phaseEnum.STREAMING
    || phase === phaseEnum.TOOL_CALL
    || phase === phaseEnum.TOOL_OUTPUT
  );
}

function isActiveLoopResponseOverlayPhase(phase, phaseEnum = {}) {
  return (
    phase === phaseEnum.AWAITING_FIRST_CHUNK
    || isStreamingResponseOverlayPhase(phase, phaseEnum)
  );
}

const RESPONSE_OVERLAY_WINDOW_MODE = Object.freeze({
  HIDDEN: 'hidden',
  ACTIVE_LOOP: 'active-loop',
  TERMINAL: 'terminal',
});

// One shared phase->mode resolver keeps the cross-window behavior readable:
// active loop phases lock interactivity + show overlay, idle hides, and
// terminal phases preserve the last response shell without re-entering the loop.
function resolveResponseOverlayWindowMode(phase, phaseEnum = {}) {
  if (phase === phaseEnum.IDLE) {
    return RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN;
  }
  if (isActiveLoopResponseOverlayPhase(phase, phaseEnum)) {
    return RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP;
  }
  if (Object.values(phaseEnum).includes(phase)) {
    return RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL;
  }
  return null;
}

function syncOverlayLoopInteractivity(active, deps = {}) {
  const {
    chatWindow,
    responseWindow,
    contextLabelWindow,
    warn = console.warn,
  } = deps;
  const targetWindows = [chatWindow, responseWindow, contextLabelWindow].filter(
    (win) => win && !win.isDestroyed(),
  );

  for (const win of targetWindows) {
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

function shouldRestoreTerminalResponseWindow(deps = {}) {
  const {
    getResponseOverlayVisible = () => false,
    responseWindow,
    chatWindow,
  } = deps;

  return Boolean(
    getResponseOverlayVisible()
      && responseWindow
      && !responseWindow.isDestroyed()
      && chatWindow
      && !chatWindow.isDestroyed()
      && chatWindow.isVisible(),
  );
}

function applyResponseOverlayWindowMode(mode, deps = {}) {
  const {
    getResponseOverlayVisible = () => false,
    setResponseOverlayVisibilityState = () => {},
    responseWindow,
    ensureResponseOverlayFallbackBounds = () => {},
    showResponseWindowWhenChatVisible = () => {},
    showResponseWindowInactive = () => {},
    syncContextLabelWindowVisibility = () => {},
  } = deps;

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN) {
    setResponseOverlayVisibilityState(false);
    if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
      responseWindow.hide();
    }
    return;
  }

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP) {
    const shouldKeepVisible = Boolean(
      getResponseOverlayVisible()
      && responseWindow
      && !responseWindow.isDestroyed()
    );
    if (!shouldKeepVisible) {
      setResponseOverlayVisibilityState(false);
      if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
        responseWindow.hide();
      }
      return;
    }
    setResponseOverlayVisibilityState(true);
    ensureResponseOverlayFallbackBounds();
    showResponseWindowWhenChatVisible();
    return;
  }

  if (mode === RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL) {
    if (shouldRestoreTerminalResponseWindow(deps)) {
      showResponseWindowInactive();
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
  syncOverlayLoopInteractivity(isActiveLoopResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE), {
    chatWindow,
    responseWindow,
    contextLabelWindow,
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
  });
}

module.exports = {
  handleResponseOverlayPhaseEvent,
  isActiveLoopResponseOverlayPhase,
  isStreamingResponseOverlayPhase,
};
