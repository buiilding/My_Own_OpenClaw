/**
 * Covers desktop stop-turn runtime behavior in the frontend test suite.
 */

import {
  DesktopStopTurnRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime';

const {
  buildStoppedCurrentTurnProjection,
  isStopTurnTargetFromCurrentTurn,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
} = DesktopStopTurnRuntime;

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

  test('does not use SDK presentation busy as a stop target without active phase', () => {
    expect(resolveStopTurnTarget({
      currentTurnProjection: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'idle',
        presentation: {
          isBusy: true,
        },
      },
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

  test('buildStoppedCurrentTurnProjection strips legacy SDK visibility fields', () => {
    const stoppedProjection = buildStoppedCurrentTurnProjection({
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
      phase: 'streaming',
      presentation: {
        phase: 'streaming',
        typingVisible: true,
        overlayVisible: true,
        isBusy: true,
        isTerminal: false,
        hasVisibleContent: true,
        entries: [{ id: 'entry-1', text: 'partial' }],
        overlayIntent: {
          visible: true,
          mode: 'response',
        },
      },
    });

    expect(stoppedProjection).toEqual(expect.objectContaining({
      phase: 'complete',
      presentation: expect.objectContaining({
        phase: 'complete',
        isBusy: false,
        isTerminal: true,
        entries: [{ id: 'entry-1', text: 'partial' }],
        overlayIntent: expect.objectContaining({
          visible: true,
          mode: 'response',
        }),
      }),
    }));
    expect(stoppedProjection.presentation).not.toHaveProperty('typingVisible');
    expect(stoppedProjection.presentation).not.toHaveProperty('overlayVisible');
    expect(stoppedProjection.presentation).not.toHaveProperty('hasVisibleContent');
  });

  test('buildStoppedCurrentTurnProjection does not use SDK visible-content flag as overlay evidence', () => {
    const stoppedProjection = buildStoppedCurrentTurnProjection({
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
      phase: 'streaming',
      presentation: {
        phase: 'streaming',
        isBusy: true,
        isTerminal: false,
        hasVisibleContent: true,
        entries: [],
        overlayIntent: {
          visible: true,
          mode: 'response',
        },
      },
    });

    expect(stoppedProjection).toEqual(expect.objectContaining({
      phase: 'complete',
      presentation: expect.objectContaining({
        phase: 'complete',
        isBusy: false,
        isTerminal: true,
        entries: [],
        overlayIntent: expect.objectContaining({
          visible: false,
          mode: 'hidden',
        }),
      }),
    }));
    expect(stoppedProjection.presentation).not.toHaveProperty('hasVisibleContent');
  });
});
