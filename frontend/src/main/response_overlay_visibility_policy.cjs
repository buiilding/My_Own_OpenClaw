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
} = {}) {
  return Boolean(
    getResponseOverlayVisible()
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

module.exports = {
  RESPONSE_OVERLAY_WINDOW_MODE,
  isStreamingResponseOverlayPhase,
  resolveResponseOverlayWindowMode,
  resolveChatWindowResponseOverlayRestore,
  shouldRestoreTerminalResponseWindow,
};
