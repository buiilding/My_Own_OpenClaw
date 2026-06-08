const RESPONSE_OVERLAY_WINDOW_MODE = Object.freeze({
  HIDDEN: 'hidden',
  ACTIVE_LOOP: 'active-loop',
  TERMINAL: 'terminal',
});

function isStreamingResponseOverlayPhase(phase, phaseEnum = {}) {
  return (
    phase === phaseEnum.AWAITING_FIRST_CHUNK
    || phase === phaseEnum.STREAMING
    || phase === phaseEnum.TOOL_CALL
    || phase === phaseEnum.TOOL_OUTPUT
  );
}

function resolveResponseOverlayWindowMode(phase, phaseEnum = {}) {
  if (phase === phaseEnum.IDLE) {
    return RESPONSE_OVERLAY_WINDOW_MODE.HIDDEN;
  }
  if (isStreamingResponseOverlayPhase(phase, phaseEnum)) {
    return RESPONSE_OVERLAY_WINDOW_MODE.ACTIVE_LOOP;
  }
  if (Object.values(phaseEnum).includes(phase)) {
    return RESPONSE_OVERLAY_WINDOW_MODE.TERMINAL;
  }
  return null;
}

function shouldRestoreTerminalResponseWindow({
  getResponseOverlayVisible = () => false,
  responseWindow,
  chatWindow,
  canShowFloatingResponseOverlay = () => true,
} = {}) {
  return Boolean(
    getResponseOverlayVisible()
      && canShowFloatingResponseOverlay()
      && responseWindow
      && !responseWindow.isDestroyed()
      && chatWindow
      && !chatWindow.isDestroyed()
      && chatWindow.isVisible(),
  );
}

function resolveChatWindowResponseOverlayRestore({
  focus = true,
  restoreResponseOverlay = false,
  responseOverlayVisible = false,
  isResponseOverlayStreamingPhase = () => false,
} = {}) {
  const isStreamingPhase = Boolean(isResponseOverlayStreamingPhase());
  const shouldRestoreResponse = Boolean(
    (focus || restoreResponseOverlay)
      && (responseOverlayVisible || isStreamingPhase),
  );

  return {
    shouldRestoreResponse,
    shouldPrimeFallbackBounds: isStreamingPhase,
  };
}

function isUsableWindow(targetWindow) {
  return Boolean(
    targetWindow
      && typeof targetWindow === 'object'
      && !(typeof targetWindow.isDestroyed === 'function' && targetWindow.isDestroyed())
  );
}

function isVisibleWindow(targetWindow) {
  return Boolean(
    isUsableWindow(targetWindow)
      && typeof targetWindow.isVisible === 'function'
      && targetWindow.isVisible()
  );
}

function canShowFloatingResponseOverlay({
  primarySurface = null,
  mainWindow = null,
  chatWindow = null,
} = {}) {
  return Boolean(
    primarySurface === 'chat'
      && isVisibleWindow(chatWindow)
      && !isVisibleWindow(mainWindow)
  );
}

module.exports = {
  RESPONSE_OVERLAY_WINDOW_MODE,
  canShowFloatingResponseOverlay,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  resolveChatWindowResponseOverlayRestore,
  shouldRestoreTerminalResponseWindow,
};
