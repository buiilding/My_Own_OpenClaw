import {
  applyStopQueryUiState,
  buildStopQueryTrackingPatch,
} from '../../frontend/src/renderer/features/chat/utils/stopQueryState';

describe('stopQueryState', () => {
  test('buildStopQueryTrackingPatch emits canonical terminal stop payload', () => {
    const stoppedAt = '2026-02-28T00:00:00.000Z';
    expect(buildStopQueryTrackingPatch(stoppedAt)).toEqual({
      phase: 'complete',
      completedAt: stoppedAt,
      lastEventAt: stoppedAt,
      lastEventType: 'stop-query',
    });
  });

  test('applyStopQueryUiState clears sending/thinking state and updates stream tracking', () => {
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const updateStreamTracking = jest.fn();
    const stoppedAt = '2026-02-28T01:02:03.456Z';

    const returnedStoppedAt = applyStopQueryUiState({
      setIsSending,
      setThinkingStatus,
      setThinkingSourceEventType,
      updateStreamTracking,
      stoppedAt,
    });

    expect(returnedStoppedAt).toBe(stoppedAt);
    expect(setIsSending).toHaveBeenCalledWith(false);
    expect(setThinkingStatus).toHaveBeenCalledWith(null);
    expect(setThinkingSourceEventType).toHaveBeenCalledWith(null);
    expect(updateStreamTracking).toHaveBeenCalledTimes(1);

    const update = updateStreamTracking.mock.calls[0][0];
    const updatedState = update({
      phase: 'streaming',
      activeTurnRef: 'turn-1',
      eventCount: 4,
    });
    expect(updatedState).toEqual({
      phase: 'complete',
      activeTurnRef: 'turn-1',
      eventCount: 4,
      completedAt: stoppedAt,
      lastEventAt: stoppedAt,
      lastEventType: 'stop-query',
    });
  });
});
