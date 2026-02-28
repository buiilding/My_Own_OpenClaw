export function buildStopQueryTrackingPatch(stoppedAt) {
  return {
    phase: 'complete',
    completedAt: stoppedAt,
    lastEventAt: stoppedAt,
    lastEventType: 'stop-query',
  };
}

export function applyStopQueryUiState({
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  updateStreamTracking,
  stoppedAt = new Date().toISOString(),
}) {
  setIsSending(false);
  setThinkingStatus(null);
  setThinkingSourceEventType(null);
  updateStreamTracking((current) => ({
    ...current,
    ...buildStopQueryTrackingPatch(stoppedAt),
  }));
  return stoppedAt;
}
