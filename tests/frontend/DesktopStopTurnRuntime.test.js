/**
 * Covers desktop stop-turn runtime behavior in the frontend test suite.
 */

import {
  resolveStopTurnTarget,
} from '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime';

describe('desktopStopTurnRuntime', () => {
  test('resolveStopTurnTarget prioritizes active SDK current-turn before pending turn', () => {
    expect(resolveStopTurnTarget({
      currentTurnProjection: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'streaming',
      },
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'sdk-current-turn',
      conversationRef: 'conv-sdk',
      turnRef: 'turn-sdk',
      canStop: true,
    });
  });

  test('resolveStopTurnTarget uses pending turn ref while SDK current-turn is terminal', () => {
    expect(resolveStopTurnTarget({
      currentTurnProjection: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'complete',
        presentation: {
          isBusy: false,
        },
      },
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('resolveStopTurnTarget returns idle when there is no active or pending turn', () => {
    expect(resolveStopTurnTarget({
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'idle',
      conversationRef: 'conv-session',
      turnRef: null,
      canStop: false,
    });
  });
});
