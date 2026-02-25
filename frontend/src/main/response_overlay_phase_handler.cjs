function isStreamingResponseOverlayPhase(phase, phaseEnum = {}) {
  return (
    phase === phaseEnum.AWAITING_FIRST_CHUNK
    || phase === phaseEnum.STREAMING
    || phase === phaseEnum.TOOL_CALL
    || phase === phaseEnum.TOOL_OUTPUT
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
  } = deps;

  if (ENABLE_OS_TOOL_GHOST_DEBUG) {
    return;
  }

  const nextPhase = event?.phase;
  if (!Object.values(RESPONSE_OVERLAY_PHASE).includes(nextPhase)) {
    return;
  }

  setResponseOverlayPhase(nextPhase);

  if (nextPhase === RESPONSE_OVERLAY_PHASE.IDLE) {
    setResponseOverlayVisibilityState(false);
    if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
      responseWindow.hide();
    }
    return;
  }

  if (isStreamingResponseOverlayPhase(nextPhase, RESPONSE_OVERLAY_PHASE)) {
    setResponseOverlayVisibilityState(true);
    if (!responseWindow || responseWindow.isDestroyed()) {
      return;
    }
    ensureResponseOverlayFallbackBounds();
    showResponseWindowWhenChatVisible();
    return;
  }

  if (
    getResponseOverlayVisible()
    && responseWindow
    && !responseWindow.isDestroyed()
    && chatWindow
    && !chatWindow.isDestroyed()
    && chatWindow.isVisible()
  ) {
    showResponseWindowInactive();
  }
  syncContextLabelWindowVisibility();
}

module.exports = {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
};
