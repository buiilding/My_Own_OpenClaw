/**
 * Covers stop query state. behavior in the frontend test suite.
 */

import {
  applyStopQueryUiState,
} from '../../frontend/src/renderer/features/chat/utils/state/stopQueryState';

describe('stopQueryState', () => {
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

  test('applyStopQueryUiState terminalizes active SDK current-turn projection immediately', () => {
    const setCurrentTurnProjection = jest.fn();
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      presentation: {
        phase: 'streaming',
        entries: [{ id: 'entry-1', text: 'Partial answer' }],
        hasVisibleContent: true,
        typingVisible: false,
        overlayVisible: true,
        isBusy: true,
        isTerminal: false,
        overlayIntent: {
          visible: true,
          mode: 'response',
          turnRef: 'turn-1',
          conversationRef: 'conv-1',
          staleGuardRef: 'turn-1',
        },
      },
    };

    applyStopQueryUiState({
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      updateStreamTracking: jest.fn(),
      setCurrentTurnProjection,
      currentTurnProjection,
      conversationRef: 'conv-1',
    });

    expect(setCurrentTurnProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'complete',
        presentation: expect.objectContaining({
          phase: 'complete',
          isBusy: false,
          isTerminal: true,
          typingVisible: false,
          overlayVisible: true,
          overlayIntent: expect.objectContaining({
            visible: true,
            mode: 'response',
          }),
        }),
      }),
      'conv-1',
    );
  });
});
