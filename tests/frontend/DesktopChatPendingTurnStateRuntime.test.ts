/**
 * Covers renderer pending-turn state runtime helpers.
 */

import {
  DesktopChatPendingTurnStateRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime';

const {
  addSupersededTurnRef,
  buildAcceptPendingTurnStateUpdate,
  buildAcceptReplayPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnBroadcastStateUpdate,
  buildPendingTurnClearWorkspaceMutation,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
} = DesktopChatPendingTurnStateRuntime;

function workspace(overrides = {}) {
  return {
    messages: [],
    isSending: false,
    thinkingStatus: 'Thinking',
    thinkingSourceEventType: 'assistant_delta',
    currentTurnProjection: { turnRef: 'turn-old' },
    conversationView: { conversationRef: 'conv-1' },
    pendingTurn: null,
    supersededTurnRefs: {},
    ...overrides,
  };
}

function storeState(overrides = {}) {
  return {
    activeConversationRef: null,
    turnConversationRefs: {},
    workspaces: {},
    ...overrides,
  };
}

const stateRuntimeDeps = {
  buildWorkspaceUpdate: (state, workspaceRef, nextWorkspace, extraState = {}) => ({
    workspaces: {
      ...state.workspaces,
      [workspaceRef]: nextWorkspace,
    },
    ...extraState,
  }),
  getProjectedWorkspaceFields: (nextWorkspace) => ({
    currentTurnProjection: nextWorkspace.currentTurnProjection,
    conversationView: nextWorkspace.conversationView,
    isSending: nextWorkspace.isSending,
    messages: nextWorkspace.messages,
    pendingTurn: nextWorkspace.pendingTurn,
    supersededTurnRefs: nextWorkspace.supersededTurnRefs,
    thinkingSourceEventType: nextWorkspace.thinkingSourceEventType,
    thinkingStatus: nextWorkspace.thinkingStatus,
  }),
  mergeTurnConversationRefs: (current, messages, conversationRef) => {
    return messages.reduce((next, message) => {
      if (message.turnRef && conversationRef) {
        return {
          ...next,
          [message.turnRef]: conversationRef,
        };
      }
      return next;
    }, current);
  },
  readWorkspaceState: (state, workspaceRef) => state.workspaces[workspaceRef] ?? workspace(),
  resolveChatWorkspaceRef: (conversationRef) => conversationRef || '__default__',
  resolveWorkspaceKey: (conversationRef, activeConversationRef) => (
    conversationRef || activeConversationRef || '__default__'
  ),
};

describe('DesktopChatPendingTurnStateRuntime', () => {
  test('normalizes valid pending turns and strips empty attachment filenames', () => {
    expect(normalizePendingTurn({
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
      userMessageId: ' user-row-1 ',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: [' one.png ', '', null, 'two.txt'],
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-row-1',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: [' one.png ', 'two.txt'],
    });
  });

  test('rejects pending turns missing identity fields', () => {
    expect(normalizePendingTurn(null)).toBeNull();
    expect(normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: '',
      userMessageId: 'row-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'row-1',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
  });

  test('matches pending turns by optional conversation and turn filters', () => {
    const pendingTurn = normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'row-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    });

    expect(doesPendingTurnMatch(pendingTurn, null)).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, { conversationRef: ' conv-1 ' })).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, { turnRef: ' turn-1 ' })).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, {
      conversationRef: 'conv-other',
      turnRef: 'turn-1',
    })).toBe(false);
  });

  test('adds and removes superseded turn refs without changing no-op maps', () => {
    const current = { 'turn-old': true } as Record<string, true>;
    expect(addSupersededTurnRef(current, 'turn-old')).toBe(current);
    expect(addSupersededTurnRef(current, 'turn-new')).toEqual({
      'turn-old': true,
      'turn-new': true,
    });
    expect(removeSupersededTurnRef(current, 'turn-missing')).toBe(current);
    expect(removeSupersededTurnRef(current, 'turn-old')).toEqual({});
  });

  test('builds pending-turn workspace mutations with the renderer bridge row', () => {
    const mutation = buildPendingTurnWorkspaceMutation({
      currentWorkspace: workspace({
        supersededTurnRefs: { 'turn-old': true },
      }),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        userMessageId: 'user-row-new',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: ['one.png'],
      },
      supersededTurnRef: 'turn-old',
    });

    expect(mutation).toEqual(expect.objectContaining({
      normalizedPendingTurn: expect.objectContaining({
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
      }),
      optimisticMessage: expect.objectContaining({
        id: 'user-row-new',
        sender: 'user',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    }));
    expect(mutation?.workspace).toEqual(expect.objectContaining({
      isSending: true,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      currentTurnProjection: null,
      conversationView: null,
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-new',
      }),
      supersededTurnRefs: { 'turn-old': true },
    }));
    expect(mutation?.messages).toHaveLength(1);
  });

  test('returns null for echoed pending turns when asked to skip them', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'user-row-new',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: null,
    };
    const currentWorkspace = workspace({
      messages: [{
        id: 'user-row-new',
        sender: 'user',
        text: 'hello',
        turnRef: 'turn-new',
      }],
      pendingTurn,
    });

    expect(buildPendingTurnWorkspaceMutation({
      currentWorkspace,
      pendingTurn,
      skipEchoedPendingTurn: true,
    })).toBeNull();
  });

  test('clears matching pending-turn workspace state', () => {
    const currentWorkspace = workspace({
      isSending: true,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-row-1',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
    });

    expect(buildPendingTurnClearWorkspaceMutation({
      currentWorkspace,
      input: { conversationRef: ' conv-1 ', turnRef: ' turn-1 ' },
    })).toEqual(expect.objectContaining({
      isSending: false,
      pendingTurn: null,
    }));
  });

  test('does not clear non-matching pending-turn workspace state', () => {
    const currentWorkspace = workspace({
      isSending: true,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-row-1',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
    });

    expect(buildPendingTurnClearWorkspaceMutation({
      currentWorkspace,
      input: { conversationRef: 'conv-other', turnRef: 'turn-1' },
    })).toBeNull();
  });

  test('builds accept-pending store updates with active workspace projection', () => {
    const state = storeState();

    const update = buildAcceptPendingTurnStateUpdate({
      deps: stateRuntimeDeps,
      pendingTurn: {
        conversationRef: 'conv-state',
        turnRef: 'turn-state',
        userMessageId: 'user-state',
        text: 'hello state',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
      state,
    });

    expect(update).toEqual(expect.objectContaining({
      activeConversationRef: 'conv-state',
      isSending: true,
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-state',
      }),
      turnConversationRefs: {
        'turn-state': 'conv-state',
      },
    }));
    expect(update?.workspaces['conv-state']).toEqual(expect.objectContaining({
      pendingTurn: expect.objectContaining({
        userMessageId: 'user-state',
      }),
    }));
  });

  test('builds replay-pending store updates with superseded turn tracking', () => {
    const state = storeState({
      workspaces: {
        'conv-replay': workspace({
          supersededTurnRefs: {},
        }),
      },
    });

    const update = buildAcceptReplayPendingTurnStateUpdate({
      deps: stateRuntimeDeps,
      messages: [],
      pendingTurn: {
        conversationRef: 'conv-replay',
        turnRef: 'turn-new',
        userMessageId: 'user-new',
        text: 'edited',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
      state,
      supersededTurnRef: 'turn-old',
    });

    expect(update?.workspaces['conv-replay']).toEqual(expect.objectContaining({
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-new',
      }),
      supersededTurnRefs: {
        'turn-old': true,
      },
    }));
  });

  test('builds pending broadcast clear store updates without store branching', () => {
    const state = storeState({
      activeConversationRef: 'conv-clear',
      workspaces: {
        'conv-clear': workspace({
          isSending: true,
          pendingTurn: {
            conversationRef: 'conv-clear',
            turnRef: 'turn-clear',
            userMessageId: 'user-clear',
            text: 'clear me',
            timestamp: '2026-06-25T12:00:00.000Z',
            attachmentFilenames: null,
          },
        }),
      },
    });

    const update = buildPendingTurnBroadcastStateUpdate({
      action: {
        kind: 'clear',
        conversationRef: 'conv-clear',
        turnRef: 'turn-clear',
      },
      deps: stateRuntimeDeps,
      state,
    });

    expect(update?.workspaces['conv-clear']).toEqual(expect.objectContaining({
      isSending: false,
      pendingTurn: null,
    }));
  });

  test('builds clear-pending store updates only for matching pending turns', () => {
    const state = storeState({
      activeConversationRef: 'conv-clear',
      workspaces: {
        'conv-clear': workspace({
          isSending: true,
          pendingTurn: {
            conversationRef: 'conv-clear',
            turnRef: 'turn-clear',
            userMessageId: 'user-clear',
            text: 'clear me',
            timestamp: '2026-06-25T12:00:00.000Z',
            attachmentFilenames: null,
          },
        }),
      },
    });

    expect(buildClearPendingTurnStateUpdate({
      deps: stateRuntimeDeps,
      input: {
        conversationRef: 'conv-other',
        turnRef: 'turn-clear',
      },
      state,
    })).toBeNull();
  });
});
