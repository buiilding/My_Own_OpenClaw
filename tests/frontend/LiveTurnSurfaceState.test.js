/**
 * Covers live turn surface state. behavior in the frontend test suite.
 */

import {
  resolveLiveTurnPresentationInput,
} from '../../frontend/src/renderer/features/chat/utils/state/liveTurnSurfaceState';

describe('liveTurnSurfaceState', () => {
  test('uses SDK current turn as live surface authority', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      isSending: false,
    });

    expect(state).toEqual({
      phase: 'complete',
      isSending: false,
      source: 'current-turn',
    });
  });

  test('keeps a new send latch when terminal projection belongs to a previous turn', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: {
        phase: 'complete',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      isSending: true,
      messages: [
        { id: 'user-1', sender: 'user', text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant', text: 'done', turnRef: 'turn-1' },
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
      ],
    });

    expect(state).toEqual({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'send-latch',
    });
  });

  test('uses only the local send latch when SDK current turn is not open yet', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      isSending: true,
    });

    expect(state).toEqual({
      phase: 'awaiting-first-chunk',
      isSending: true,
      source: 'send-latch',
    });
  });

  test('ignores legacy stream phase inputs when SDK current turn is absent', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      streamTracking: { phase: 'streaming' },
      phase: 'tool-call',
      isSending: false,
    });

    expect(state).toEqual({
      phase: 'idle',
      isSending: false,
      source: 'idle',
    });
  });
});
