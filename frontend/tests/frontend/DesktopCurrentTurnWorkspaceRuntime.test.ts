import {
  DesktopCurrentTurnWorkspaceRuntime,
} from '../../src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime';

const {
  buildNoViewSdkLiveTurnWorkspaceMutation,
  buildSetNoViewSdkLiveTurnStateUpdate,
} = DesktopCurrentTurnWorkspaceRuntime;

function conversationView(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    revisionId: null,
    displayRows: [],
    liveTurn: {
      turnRef: 'turn-2',
      phase: 'streaming',
      canStop: true,
      entries: [],
      isBusy: true,
      isTerminal: false,
      lastError: null,
    },
    surfaces: {
      pill: {
        mode: 'busy',
      },
      dashboard: {
        mode: 'busy',
      },
      responseOverlay: {
        mode: 'response',
        visible: true,
        guardRef: 'turn-2',
        ownerConversationRef: 'conv-1',
        turnRef: 'turn-2',
      },
    },
    actions: {
      canEdit: false,
      canRetry: false,
      canFork: false,
    },
    ...overrides,
  };
}

function pendingTurn(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-1',
    userMessageId: 'user-1',
    text: 'pending prompt',
    timestamp: '2026-06-27T12:00:00.000Z',
    ...overrides,
  };
}

describe('DesktopCurrentTurnWorkspaceRuntime', () => {
  test('returns null when SDK live turn and pending turn do not change', () => {
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const currentWorkspace = {
      sdkLiveTurn: sdkLiveTurn,
      pendingTurn: null,
      messages: [],
    };

    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace,
      sdkLiveTurn,
    })).toBeNull();
  });

  test('keeps matching pending turn when SDK live turn has no visible replacement rows', () => {
    const currentWorkspace = {
      sdkLiveTurn: null,
      pendingTurn: pendingTurn(),
      messages: [],
    };
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        isBusy: true,
      },
    };

    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace,
      sdkLiveTurn,
    })).toEqual({
      sdkLiveTurn: sdkLiveTurn,
      pendingTurn: currentWorkspace.pendingTurn,
      messages: [],
    });
  });

  test('keeps pending turn through non-authoritative same-turn idle live turn', () => {
    const currentPendingTurn = pendingTurn();
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };

    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace: {
        sdkLiveTurn: null,
        pendingTurn: currentPendingTurn,
        messages: [],
      },
      sdkLiveTurn,
    })).toEqual({
      sdkLiveTurn: sdkLiveTurn,
      pendingTurn: currentPendingTurn,
      messages: [],
    });
  });

  test('does not store raw SDK live turn when conversation view exists', () => {
    const staleProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-stale',
      phase: 'streaming',
      assistantText: 'stale',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
      phase: 'streaming',
      assistantText: 'view owns this',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const currentPendingTurn = pendingTurn({
      turnRef: 'turn-2',
      userMessageId: 'user-2',
    });

    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace: {
        conversationView: conversationView(),
        sdkLiveTurn: staleProjection,
        pendingTurn: currentPendingTurn,
        messages: [],
      },
      sdkLiveTurn,
    })).toEqual({
      conversationView: conversationView(),
      sdkLiveTurn: null,
      pendingTurn: currentPendingTurn,
      messages: [],
    });
  });

  test('keeps partial conversation view objects on the no-view live-turn path', () => {
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
      phase: 'streaming',
      assistantText: 'no-view fallback',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const currentPendingTurn = pendingTurn({
      turnRef: 'turn-2',
      userMessageId: 'user-2',
    });

    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace: {
        conversationView: {
          conversationRef: 'conv-1',
          displayRows: [],
        },
        sdkLiveTurn: null,
        pendingTurn: currentPendingTurn,
        messages: [],
      },
      sdkLiveTurn,
    })).toEqual({
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      sdkLiveTurn,
      pendingTurn: currentPendingTurn,
      messages: [],
    });
  });

  test('returns null when conversation view already owns live-turn state', () => {
    expect(buildNoViewSdkLiveTurnWorkspaceMutation({
      currentWorkspace: {
        conversationView: conversationView(),
        sdkLiveTurn: null,
        pendingTurn: pendingTurn(),
        messages: [],
      },
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        assistantText: 'ignored',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    })).toBeNull();
  });

  test('buildSetNoViewSdkLiveTurnStateUpdate resolves workspace and applies mutation', () => {
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          sdkLiveTurn: null,
          pendingTurn: pendingTurn(),
          messages: [],
        },
      },
    };
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        isBusy: true,
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
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildSetNoViewSdkLiveTurnStateUpdate({
      conversationRef: 'conv-1',
      deps,
      sdkLiveTurn: sdkLiveTurn,
      state,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        sdkLiveTurn: sdkLiveTurn,
        pendingTurn: pendingTurn(),
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          sdkLiveTurn: sdkLiveTurn,
          pendingTurn: pendingTurn(),
        }),
      },
    }));
  });
});
