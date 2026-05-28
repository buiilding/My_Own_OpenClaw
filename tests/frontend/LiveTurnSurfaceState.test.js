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
      streamTracking: { phase: 'tool-output' },
      phase: 'tool-output',
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
      streamTracking: { phase: 'complete' },
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

  test('falls back to stream tracking before direct phase', () => {
    const state = resolveLiveTurnPresentationInput({
      currentTurnProjection: null,
      streamTracking: { phase: 'streaming' },
      phase: 'idle',
      isSending: false,
    });

    expect(state).toEqual({
      phase: 'streaming',
      isSending: false,
      source: 'fallback',
    });
  });
});
