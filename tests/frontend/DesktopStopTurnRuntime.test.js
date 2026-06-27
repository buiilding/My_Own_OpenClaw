/**
 * Covers desktop stop-turn runtime behavior in the frontend test suite.
 */

import {
  DesktopStopTurnRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime';

const {
  buildAcceptStoppedTurnStateUpdate,
  buildStopTurnExecutionPlan,
  buildStoppedTurnWorkspaceMutation,
  buildStoppedSdkLiveTurn,
  executeStopTurnExecutionPlan,
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
    revisionId: null,
    displayRows: [],
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
      dashboard: {
        mode: phase === 'complete' || phase === 'idle' ? 'idle' : 'busy',
      },
      responseOverlay: {
        mode: phase === 'complete' || phase === 'idle' ? 'hidden' : 'response',
        visible: phase !== 'complete' && phase !== 'idle',
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
        turnRef,
      },
    },
    actions: {
      canEdit: false,
      canRetry: false,
      canFork: false,
    },
  };
}

function pendingTurn({
  conversationRef = 'conv-pending',
  turnRef = 'turn-pending',
  userMessageId = 'user-pending',
  text = 'pending prompt',
  timestamp = '2026-06-25T12:00:00.000Z',
  ...overrides
} = {}) {
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
    ...overrides,
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
    sdkLiveTurn: {
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
      phase: 'streaming',
    },
    pendingTurn: pendingTurn({
      conversationRef: 'conv-stop',
      turnRef: 'turn-stop',
    }),
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
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
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
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('resolveStopTurnTarget rejects attachment-bearing pending bridge objects', () => {
    expect(resolveStopTurnTarget({
      pendingTurn: pendingTurn({
        attachments: [{
          id: 'attachment-1',
          kind: 'image',
          status: 'ready',
        }],
      }),
      conversationRef: 'conv-session',
    })).toBeNull();
  });

  test('resolveStopTurnTarget uses pending turn ref without terminal current-turn fallback', () => {
    expect(resolveStopTurnTarget({
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
      conversationRef: 'conv-session',
    })).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('resolveStopTurnTarget returns null when there is no SDK or pending stop target', () => {
    expect(resolveStopTurnTarget({
      conversationRef: 'conv-session',
    })).toBeNull();
  });

  test('resolveStopTurnTarget keeps pending turn stoppable through a non-authoritative idle view', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
        phase: 'idle',
        canStop: false,
      }),
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
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
    })).toBeNull();
  });

  test('resolveStopTurnTarget does not treat display timeline rows as ConversationView authority', () => {
    expect(resolveStopTurnTarget({
      conversationView: {
        conversationRef: 'conv-display-timeline',
        rows: [],
      },
      conversationRef: 'conv-session',
    })).toBeNull();
  });

  test('classifies only pending bridge targets in stop execution plans', () => {
    const pendingTarget = resolveStopTurnTarget({
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
    });
    const idleTarget = resolveStopTurnTarget({
      conversationRef: 'conv-idle',
    });

    expect(buildStopTurnExecutionPlan(pendingTarget).shouldClearPendingBridge).toBe(true);
    expect(buildStopTurnExecutionPlan(idleTarget).shouldClearPendingBridge).toBe(false);

    const viewTarget = resolveStopTurnTarget({
      conversationView: conversationView(),
    });
    expect(viewTarget.source).toBe('conversation-view');
    expect(buildStopTurnExecutionPlan(viewTarget).shouldClearPendingBridge).toBe(false);
  });

  test('builds stop execution plans with pending bridge cleanup owned by runtime', () => {
    expect(buildStopTurnExecutionPlan(resolveStopTurnTarget({
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      }),
    }))).toEqual({
      canStop: true,
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      shouldClearPendingBridge: true,
    });

    expect(buildStopTurnExecutionPlan(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
      }),
    }))).toEqual({
      canStop: true,
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      shouldClearPendingBridge: false,
    });
  });

  test('rejects padded ConversationView, pending bridge, and direct stop target refs', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: ' conv-view ',
        turnRef: 'turn-view',
      }),
      conversationRef: 'conv-session',
    })).toBeNull();

    expect(resolveStopTurnTarget({
      pendingTurn: pendingTurn({
        conversationRef: 'conv-pending',
        turnRef: ' turn-pending ',
      }),
      conversationRef: 'conv-session',
    })).toBeNull();

    expect(buildStopTurnExecutionPlan({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: ' turn-pending ',
      canStop: true,
    })).toEqual({
      canStop: false,
      conversationRef: 'conv-pending',
      turnRef: null,
      shouldClearPendingBridge: false,
    });
  });

  test('does not publish padded idle stop conversation refs', () => {
    expect(resolveStopTurnTarget({
      conversationView: conversationView({
        conversationRef: ' conv-view ',
        turnRef: 'turn-view',
        canStop: false,
      }),
      conversationRef: ' conv-session ',
    })).toBeNull();

    expect(resolveStopTurnTarget({
      conversationRef: ' conv-session ',
    })).toBeNull();
  });

  test('executes pending stop plans inside runtime with bridge cleanup', () => {
    const deps = {
      acceptStoppedTurn: jest.fn(),
      clearPendingTurn: jest.fn(),
      setActiveConversationRef: jest.fn(),
      stopLiveTurn: jest.fn(),
      stopPlayback: jest.fn(),
    };

    const result = executeStopTurnExecutionPlan({
      deps,
      stopTarget: resolveStopTurnTarget({
        pendingTurn: pendingTurn({
          conversationRef: 'conv-pending',
          turnRef: 'turn-pending',
        }),
      }),
    });

    expect(result).toBe(true);
    expect(deps.setActiveConversationRef).toHaveBeenCalledWith('conv-pending');
    expect(deps.acceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    });
    expect(deps.stopPlayback).toHaveBeenCalledTimes(1);
    expect(deps.clearPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    });
    expect(deps.stopLiveTurn).toHaveBeenCalledWith('conv-pending', 'turn-pending');
  });

  test('executes ConversationView stop plans without pending bridge cleanup', () => {
    const deps = {
      acceptStoppedTurn: jest.fn(),
      clearPendingTurn: jest.fn(),
      setActiveConversationRef: jest.fn(),
      stopLiveTurn: jest.fn(),
      stopPlayback: jest.fn(),
    };

    const result = executeStopTurnExecutionPlan({
      deps,
      stopTarget: resolveStopTurnTarget({
        conversationView: conversationView({
          conversationRef: 'conv-view',
          turnRef: 'turn-view',
        }),
      }),
    });

    expect(result).toBe(true);
    expect(deps.setActiveConversationRef).toHaveBeenCalledWith('conv-view');
    expect(deps.acceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
    });
    expect(deps.clearPendingTurn).not.toHaveBeenCalled();
    expect(deps.stopLiveTurn).toHaveBeenCalledWith('conv-view', 'turn-view');
  });

  test('does not execute stop side effects for disabled or idle plans', () => {
    const deps = {
      acceptStoppedTurn: jest.fn(),
      clearPendingTurn: jest.fn(),
      setActiveConversationRef: jest.fn(),
      stopLiveTurn: jest.fn(),
      stopPlayback: jest.fn(),
    };

    expect(executeStopTurnExecutionPlan({
      deps,
      enabled: false,
      stopTarget: resolveStopTurnTarget({
        pendingTurn: pendingTurn({
          conversationRef: 'conv-pending',
          turnRef: 'turn-pending',
        }),
      }),
    })).toBe(false);
    expect(executeStopTurnExecutionPlan({
      deps,
      stopTarget: resolveStopTurnTarget({
        conversationRef: 'conv-idle',
      }),
    })).toBe(false);
    expect(deps.acceptStoppedTurn).not.toHaveBeenCalled();
    expect(deps.clearPendingTurn).not.toHaveBeenCalled();
    expect(deps.setActiveConversationRef).not.toHaveBeenCalled();
    expect(deps.stopLiveTurn).not.toHaveBeenCalled();
    expect(deps.stopPlayback).not.toHaveBeenCalled();
  });

  test('continues stop execution when pending bridge cleanup throws', () => {
    const cleanupError = new Error('clear failed');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = {
      acceptStoppedTurn: jest.fn(),
      clearPendingTurn: jest.fn(() => {
        throw cleanupError;
      }),
      stopLiveTurn: jest.fn(),
    };

    try {
      const result = executeStopTurnExecutionPlan({
        deps,
        stopTarget: resolveStopTurnTarget({
          pendingTurn: pendingTurn({
            conversationRef: 'conv-pending',
            turnRef: 'turn-pending',
          }),
        }),
        warningContext: 'StopTest',
      });

      expect(result).toBe(true);
      expect(deps.acceptStoppedTurn).toHaveBeenCalledWith({
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      });
      expect(deps.stopLiveTurn).toHaveBeenCalledWith('conv-pending', 'turn-pending');
      expect(warnSpy).toHaveBeenCalledWith(
        '[StopTest] Failed to clear pending turn before stop:',
        cleanupError,
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('reports async stop failures without throwing from stop execution', async () => {
    const stopError = new Error('stop failed');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = {
      acceptStoppedTurn: jest.fn(),
      stopLiveTurn: jest.fn(() => Promise.reject(stopError)),
    };

    try {
      const result = executeStopTurnExecutionPlan({
        deps,
        stopTarget: resolveStopTurnTarget({
          conversationView: conversationView(),
        }),
        warningContext: 'StopTest',
      });

      expect(result).toBe(true);
      await Promise.resolve();
      expect(warnSpy).toHaveBeenCalledWith(
        '[StopTest] Failed to stop query:',
        stopError,
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('buildStoppedSdkLiveTurn strips legacy SDK visibility fields', () => {
    const stoppedSdkLiveTurn = buildStoppedSdkLiveTurn({
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

    expect(stoppedSdkLiveTurn).toEqual(expect.objectContaining({
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
    expect(stoppedSdkLiveTurn.presentation).not.toHaveProperty('typingVisible');
    expect(stoppedSdkLiveTurn.presentation).not.toHaveProperty('overlayVisible');
    expect(stoppedSdkLiveTurn.presentation).not.toHaveProperty('hasVisibleContent');
  });

  test('buildStoppedTurnWorkspaceMutation clears matching pending turn and terminalizes SDK live turn', () => {
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
      sdkLiveTurn: expect.objectContaining({
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

  test('buildStoppedTurnWorkspaceMutation rejects repaired live and pending refs', () => {
    expect(buildStoppedTurnWorkspaceMutation({
      conversationRef: ' conv-stop ',
      currentWorkspace: workspace(),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    })).toBeNull();

    expect(buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace({
        sdkLiveTurn: {
          conversationRef: ' conv-stop ',
          turnRef: 'turn-stop',
          phase: 'streaming',
        },
        pendingTurn: null,
      }),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    })).toBeNull();

    expect(buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace({
        sdkLiveTurn: null,
        pendingTurn: pendingTurn({
          conversationRef: 'conv-stop',
          turnRef: ' turn-stop ',
        }),
      }),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    })).toBeNull();
  });

  test('buildStoppedTurnWorkspaceMutation ignores raw live-turn fallback when ConversationView exists', () => {
    expect(buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace({
        conversationView: conversationView({
          conversationRef: 'conv-stop',
          turnRef: 'turn-view',
          canStop: true,
        }),
        pendingTurn: null,
      }),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    })).toBeNull();
  });

  test('buildStoppedTurnWorkspaceMutation does not treat display timeline rows as ConversationView authority', () => {
    const nextWorkspace = buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace({
        conversationView: {
          conversationRef: 'conv-stop',
          rows: [],
        },
        pendingTurn: null,
      }),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    });

    expect(nextWorkspace).toEqual(expect.objectContaining({
      sdkLiveTurn: expect.objectContaining({
        conversationRef: 'conv-stop',
        turnRef: 'turn-stop',
        phase: 'complete',
      }),
      streamTracking: expect.objectContaining({
        phase: 'complete',
        lastEventType: 'stop-query',
      }),
    }));
  });

  test('buildStoppedTurnWorkspaceMutation clears pending bridge under ConversationView without raw fallback', () => {
    const nextWorkspace = buildStoppedTurnWorkspaceMutation({
      conversationRef: 'conv-stop',
      currentWorkspace: workspace({
        conversationView: conversationView({
          conversationRef: 'conv-stop',
          turnRef: 'turn-view',
          canStop: true,
        }),
      }),
      stoppedAt: '2026-06-25T12:01:00.000Z',
      turnRef: 'turn-stop',
    });

    expect(nextWorkspace).toEqual(expect.objectContaining({
      pendingTurn: null,
      sdkLiveTurn: null,
      isSending: false,
      streamTracking: expect.objectContaining({
        phase: 'complete',
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
        conversationRef: 'conv-stop',
        stoppedAt: '2026-06-25T12:01:00.000Z',
        turnRef: 'turn-stop',
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
        sdkLiveTurn: expect.objectContaining({
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

  test('buildAcceptStoppedTurnStateUpdate rejects padded stopped-turn input', () => {
    const state = {
      activeConversationRef: 'conv-active',
      workspaces: {
        'conversation:conv-active': workspace(),
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn(),
      readWorkspaceState: jest.fn(),
      resolveWorkspaceKey: jest.fn(),
    };

    expect(buildAcceptStoppedTurnStateUpdate({
      deps,
      input: {
        conversationRef: ' conv-stop ',
        stoppedAt: '2026-06-25T12:01:00.000Z',
        turnRef: 'turn-stop',
      },
      state,
    })).toBeNull();
    expect(buildAcceptStoppedTurnStateUpdate({
      deps,
      input: {
        conversationRef: 'conv-stop',
        stoppedAt: '2026-06-25T12:01:00.000Z',
        turnRef: ' turn-stop ',
      },
      state,
    })).toBeNull();
    expect(deps.resolveWorkspaceKey).not.toHaveBeenCalled();
    expect(deps.readWorkspaceState).not.toHaveBeenCalled();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildStoppedSdkLiveTurn does not use SDK visible-content flag as overlay evidence', () => {
    const stoppedSdkLiveTurn = buildStoppedSdkLiveTurn({
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

    expect(stoppedSdkLiveTurn).toEqual(expect.objectContaining({
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
    expect(stoppedSdkLiveTurn.presentation).not.toHaveProperty('hasVisibleContent');
  });
});
