/**
 * Covers desktop stop-turn runtime behavior in the frontend test suite.
 */

import {
  DesktopStopTurnRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime';

const {
  buildAcceptStoppedTurnStateUpdate,
  buildStoppedTurnWorkspaceMutation,
  buildStoppedCurrentTurnProjection,
  isStopTurnTargetFromPendingTurn,
  resolveStopTurnTarget,
} = DesktopStopTurnRuntime;

function conversationView({
  conversationRef = 'conv-view',
  turnRef = 'turn-view',
  phase = 'streaming',
  canStop = true,
} = {}) {
  return {
    conversationRef,
    liveTurn: {
      turnRef,
      phase,
      canStop,
      entries: [],
      isBusy: phase !== 'complete' && phase !== 'idle',
      isTerminal: phase === 'complete',
      lastError: null,
    },
    surfaces: {
      pill: {
        mode: phase === 'complete' || phase === 'idle' ? 'idle' : 'busy',
      },
    },
  };
}

function workspace(overrides = {}) {
  return {
    messages: [],
    isSending: true,
    thinkingStatus: 'Thinking',
    thinkingSourceEventType: 'assistant_delta',
    streamTracking: {
      activeTurnRef: 'turn-stop',
      phase: 'streaming',
      startedAt: '2026-06-25T12:00:00.000Z',
      firstChunkAt: null,
      completedAt: null,
      lastEventAt: null,
      lastEventType: null,
      eventCount: 1,
      chunkCount: 0,
      toolCallCount: 0,
      toolOutputCount: 0,
      lastChunkSize: 0,
      lastError: null,
    },
    currentTurnProjection: {
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
      phase: 'streaming',
    },
    pendingTurn: {
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
    },
    ...overrides,
  };
}

describe('desktopStopTurnRuntime', () => {
  test('resolveStopTurnTarget prioritizes stoppable ConversationView over pending bridge', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
        canStop: true,
      }),
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'conversation-view',
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      canStop: true,
    });
  });

  test('resolveStopTurnTarget keeps pending bridge without raw current-turn authority', () => {
    expect(resolveStopTurnTarget({
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

  test('resolveStopTurnTarget uses pending turn ref without terminal current-turn fallback', () => {
    expect(resolveStopTurnTarget({
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

  test('resolveStopTurnTarget keeps pending turn stoppable through a non-authoritative idle view', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
        phase: 'idle',
        canStop: false,
      }),
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

  test('resolveStopTurnTarget lets idle ConversationView suppress stale current-turn stop state', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view-complete',
        phase: 'complete',
        canStop: false,
      }),
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'idle',
      conversationRef: 'conv-view',
      turnRef: 'turn-view-complete',
      canStop: false,
    });
  });

  test('classifies only pending bridge targets behind runtime predicates', () => {
    const pendingTarget = resolveStopTurnTarget({
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    });
    const idleTarget = resolveStopTurnTarget({
      conversationRef: 'conv-idle',
    });

    expect(isStopTurnTargetFromPendingTurn(pendingTarget)).toBe(true);
    expect(isStopTurnTargetFromPendingTurn(idleTarget)).toBe(false);

    const viewTarget = resolveStopTurnTarget({
      conversationView: conversationView(),
    });
    expect(viewTarget.source).toBe('conversation-view');
    expect(isStopTurnTargetFromPendingTurn(viewTarget)).toBe(false);
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

  test('buildStoppedTurnWorkspaceMutation clears matching pending turn and terminalizes projection', () => {
    const nextWorkspace = buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace(),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    });

    expect(nextWorkspace).toEqual(expect.objectContaining({
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      pendingTurn: null,
      currentTurnProjection: expect.objectContaining({
        phase: 'complete',
      }),
      streamTracking: expect.objectContaining({
        phase: 'complete',
        completedAt: '2026-06-25T12:01:00.000Z',
        lastEventAt: '2026-06-25T12:01:00.000Z',
        lastEventType: 'stop-query',
      }),
    }));
  });

  test('buildStoppedTurnWorkspaceMutation ignores stale target identities', () => {
    expect(buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-other',
      currentWorkspace: workspace(),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    })).toBeNull();
  });

  test('buildAcceptStoppedTurnStateUpdate resolves workspace and applies stopped mutation', () => {
    const state = {
      activeConversationRef: 'conv-active',
      workspaces: {
        'conversation:conv-active': workspace(),
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace) => ({
        ...currentState,
        workspaces: {
          ...currentState.workspaces,
          [workspaceRef]: nextWorkspace,
        },
      })),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conversation:conv-active'),
    };

    const nextState = buildAcceptStoppedTurnStateUpdate({
      deps,
      input: {
        conversationRef: ' conv-stop ',
        stoppedAt: '2026-06-25T12:01:00.000Z',
        turnRef: ' turn-stop ',
      },
      state,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-stop', 'conv-active');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conversation:conv-active');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conversation:conv-active',
      expect.objectContaining({
        pendingTurn: null,
        currentTurnProjection: expect.objectContaining({
          phase: 'complete',
        }),
        streamTracking: expect.objectContaining({
          lastEventType: 'stop-query',
        }),
      }),
    );
    expect(nextState.workspaces['conversation:conv-active']).toEqual(expect.objectContaining({
      pendingTurn: null,
      isSending: false,
    }));
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
