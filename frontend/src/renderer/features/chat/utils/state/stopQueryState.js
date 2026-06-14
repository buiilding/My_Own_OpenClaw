/**
 * Provides the stop query state module for the renderer UI.
 */

function buildStopQueryTrackingPatch(stoppedAt) {
  return {
    phase: 'complete',
    completedAt: stoppedAt,
    lastEventAt: stoppedAt,
    lastEventType: 'stop-query',
  };
}

function hasVisibleCurrentTurnContent(presentation) {
  return (
    presentation?.hasVisibleContent === true
    || (Array.isArray(presentation?.entries) && presentation.entries.length > 0)
  );
}

function buildStoppedCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return null;
  }
  const presentation = currentTurnProjection.presentation;
  if (!presentation || typeof presentation !== 'object') {
    return {
      ...currentTurnProjection,
      phase: 'complete',
    };
  }
  const hasVisibleContent = hasVisibleCurrentTurnContent(presentation);
  const overlayIntent = presentation.overlayIntent && typeof presentation.overlayIntent === 'object'
    ? presentation.overlayIntent
    : {};
  return {
    ...currentTurnProjection,
    phase: 'complete',
    presentation: {
      ...presentation,
      phase: 'complete',
      isBusy: false,
      isTerminal: true,
      typingVisible: false,
      overlayVisible: hasVisibleContent,
      overlayIntent: {
        ...overlayIntent,
        visible: hasVisibleContent,
        mode: hasVisibleContent ? 'response' : 'hidden',
      },
    },
  };
}

export function applyStopQueryUiState({
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  updateStreamTracking,
  setCurrentTurnProjection,
  currentTurnProjection = null,
  conversationRef = null,
  stoppedAt = new Date().toISOString(),
}) {
  setIsSending(false, conversationRef);
  setThinkingStatus(null, conversationRef);
  setThinkingSourceEventType(null, conversationRef);
  if (typeof setCurrentTurnProjection === 'function') {
    setCurrentTurnProjection(
      buildStoppedCurrentTurnProjection(currentTurnProjection),
      conversationRef,
    );
  }
  updateStreamTracking((current) => ({
    ...current,
    ...buildStopQueryTrackingPatch(stoppedAt),
  }), conversationRef);
  return stoppedAt;
}
