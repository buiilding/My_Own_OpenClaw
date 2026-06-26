import {
  DesktopCurrentTurnWorkspaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime';

const {
  buildCurrentTurnWorkspaceMutation,
  buildSetSdkLiveTurnStateUpdate,
} = DesktopCurrentTurnWorkspaceRuntime;

describe('DesktopCurrentTurnWorkspaceRuntime', () => {
  test('returns null when projection and pending turn do not change', () => {
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const currentWorkspace = {
      currentTurnProjection,
      pendingTurn: null,
      messages: [],
    };

    expect(buildCurrentTurnWorkspaceMutation({
      currentWorkspace,
      currentTurnProjection,
    })).toBeNull();
  });

  test('clears matching pending turn when SDK projection is authoritative', () => {
    const currentWorkspace = {
      currentTurnProjection: null,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
      },
      messages: [],
    };
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };

    expect(buildCurrentTurnWorkspaceMutation({
      currentWorkspace,
      currentTurnProjection,
    })).toEqual({
      currentTurnProjection,
      pendingTurn: null,
      messages: [],
    });
  });

  test('keeps pending turn through non-authoritative same-turn idle projection', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
    };
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };

    expect(buildCurrentTurnWorkspaceMutation({
      currentWorkspace: {
        currentTurnProjection: null,
        pendingTurn,
        messages: [],
      },
      currentTurnProjection,
    })).toEqual({
      currentTurnProjection,
      pendingTurn,
      messages: [],
    });
  });

  test('does not store raw current-turn projection when conversation view exists', () => {
    const staleProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-stale',
      phase: 'streaming',
      assistantText: 'stale',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
      phase: 'streaming',
      assistantText: 'view owns this',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
      userMessageId: 'user-2',
    };

    expect(buildCurrentTurnWorkspaceMutation({
      currentWorkspace: {
        conversationView: {
          conversationRef: 'conv-1',
          displayRows: [],
          liveTurn: {
            turnRef: 'turn-2',
            phase: 'streaming',
          },
        },
        currentTurnProjection: staleProjection,
        pendingTurn,
        messages: [],
      },
      currentTurnProjection,
    })).toEqual({
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
        liveTurn: {
          turnRef: 'turn-2',
          phase: 'streaming',
        },
      },
      currentTurnProjection: null,
      pendingTurn,
      messages: [],
    });
  });

  test('returns null when conversation view already owns live-turn state', () => {
    expect(buildCurrentTurnWorkspaceMutation({
      currentWorkspace: {
        conversationView: {
          conversationRef: 'conv-1',
          displayRows: [],
        },
        currentTurnProjection: null,
        pendingTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          userMessageId: 'user-1',
        },
        messages: [],
      },
      currentTurnProjection: {
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

  test('buildSetSdkLiveTurnStateUpdate resolves workspace and applies mutation', () => {
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          currentTurnProjection: null,
          pendingTurn: {
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            userMessageId: 'user-1',
          },
          messages: [],
        },
      },
    };
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
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

    const nextState = buildSetSdkLiveTurnStateUpdate({
      conversationRef: 'conv-1',
      deps,
      sdkLiveTurn: currentTurnProjection,
      state,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        currentTurnProjection,
        pendingTurn: null,
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          currentTurnProjection,
          pendingTurn: null,
        }),
      },
    }));
  });
});
