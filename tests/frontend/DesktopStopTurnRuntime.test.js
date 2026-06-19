/**
 * Covers desktop stop-turn runtime behavior in the frontend test suite.
 */

import {
  isStopTurnTargetFromCurrentTurn,
  isStopTurnTargetFromPendingTurn,
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

  test('classifies stop target sources behind runtime predicates', () => {
    const currentTurnTarget = resolveStopTurnTarget({
      currentTurnProjection: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'awaiting',
      },
    });
    const pendingTarget = resolveStopTurnTarget({
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    });
    const idleTarget = resolveStopTurnTarget({
      conversationRef: 'conv-idle',
    });

    expect(isStopTurnTargetFromCurrentTurn(currentTurnTarget)).toBe(true);
    expect(isStopTurnTargetFromPendingTurn(currentTurnTarget)).toBe(false);
    expect(isStopTurnTargetFromCurrentTurn(pendingTarget)).toBe(false);
    expect(isStopTurnTargetFromPendingTurn(pendingTarget)).toBe(true);
    expect(isStopTurnTargetFromCurrentTurn(idleTarget)).toBe(false);
    expect(isStopTurnTargetFromPendingTurn(idleTarget)).toBe(false);
  });
});
