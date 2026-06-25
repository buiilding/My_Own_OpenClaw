import {
  DesktopCurrentTurnWorkspaceRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime';

const {
  buildCurrentTurnWorkspaceMutation,
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
});
