/**
 * Covers renderer pending-turn state runtime helpers.
 */

import {
  DesktopChatPendingTurnStateRuntime,
} from '../../src/renderer/app/runtime/desktopChatPendingTurnStateRuntime';

const {
  buildAcceptPendingTurnStateUpdate,
  buildClearPendingTurnStateUpdate,
  buildPendingTurnBroadcastStateUpdate,
  buildPendingTurnClearWorkspaceMutation,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
} = DesktopChatPendingTurnStateRuntime;

function workspace(overrides = {}) {
  return {
    messages: [],
    isSending: false,
    thinkingStatus: 'Thinking',
    thinkingSourceEventType: 'assistant_delta',
    sdkLiveTurn: { turnRef: 'turn-old' },
    conversationView: { conversationRef: 'conv-1' },
    pendingTurn: null,
    ...overrides,
  };
}

function storeState(overrides = {}) {
  return {
    activeConversationRef: null,
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
  recordTurnConversationRefs: jest.fn(),
  readWorkspaceState: (state, workspaceRef) => state.workspaces[workspaceRef] ?? workspace(),
  resolveChatWorkspaceRef: (conversationRef) => conversationRef || '__default__',
  resolveWorkspaceKey: (conversationRef, activeConversationRef) => (
    conversationRef || activeConversationRef || '__default__'
  ),
};

describe('DesktopChatPendingTurnStateRuntime', () => {
  beforeEach(() => {
    stateRuntimeDeps.recordTurnConversationRefs.mockClear();
  });

  test('normalizes valid pending turns without retaining visual attachment state', () => {
    expect(normalizePendingTurn({
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
      userMessageId: ' user-row-1 ',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachments: [{
        id: 'attachment-1',
        kind: 'image',
        status: 'ready',
      }],
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-row-1',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
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

  test('builds pending-turn workspace mutations without appending the renderer bridge row', () => {
    const mutation = buildPendingTurnWorkspaceMutation({
      currentWorkspace: workspace(),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        userMessageId: 'user-row-new',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    });

    expect(mutation).toEqual(expect.objectContaining({
      normalizedPendingTurn: expect.objectContaining({
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
      }),
      pendingMessage: expect.objectContaining({
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
      sdkLiveTurn: null,
      conversationView: null,
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-new',
      }),
    }));
    expect(mutation?.messages).toEqual([]);
  });

  test('returns null for echoed pending turns when asked to skip them', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'user-row-new',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const currentWorkspace = workspace({
      messages: [],
      pendingTurn,
    });

    expect(buildPendingTurnWorkspaceMutation({
      currentWorkspace,
      pendingTurn,
      skipEchoedPendingTurn: true,
    })).toBeNull();
  });

  test('does not skip pending turns solely because a raw message row matches', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'user-row-new',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const currentWorkspace = workspace({
      messages: [{
        id: 'user-row-new',
        sender: 'user',
        text: 'hello',
        turnRef: 'turn-new',
      }],
      pendingTurn: null,
    });

    expect(buildPendingTurnWorkspaceMutation({
      currentWorkspace,
      pendingTurn,
      skipEchoedPendingTurn: true,
    })).toEqual(expect.objectContaining({
      pendingMessage: expect.objectContaining({
        id: 'user-row-new',
      }),
    }));
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
      },
    });

    expect(buildPendingTurnClearWorkspaceMutation({
      currentWorkspace,
      input: { conversationRef: 'conv-other', turnRef: 'turn-1' },
    })).toBeNull();
  });

  test('builds accept-pending store updates with workspace-only pending state', () => {
    const state = storeState();

    const update = buildAcceptPendingTurnStateUpdate({
      deps: stateRuntimeDeps,
      pendingTurn: {
        conversationRef: 'conv-state',
        turnRef: 'turn-state',
        userMessageId: 'user-state',
        text: 'hello state',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      state,
    });

    expect(update).toEqual(expect.objectContaining({
      activeConversationRef: 'conv-state',
    }));
    expect(stateRuntimeDeps.recordTurnConversationRefs).toHaveBeenCalledWith(
      [expect.objectContaining({
        id: 'user-state',
        turnRef: 'turn-state',
      })],
      'conv-state',
    );
    expect(update?.workspaces['conv-state']).toEqual(expect.objectContaining({
      isSending: true,
      pendingTurn: expect.objectContaining({
        userMessageId: 'user-state',
        turnRef: 'turn-state',
      }),
    }));
  });

  test('keeps existing ConversationView when accepting a normal pending send', () => {
    const conversationView = {
      conversationRef: 'conv-state',
      revisionId: 'rev-current',
      displayRows: [],
    };
    const rawMessages = [{
      id: 'stale-row',
      sender: 'user',
      text: 'stale raw prompt',
    }];
    const state = storeState({
      activeConversationRef: 'conv-state',
      workspaces: {
        'conv-state': workspace({
          messages: rawMessages,
          conversationView,
        }),
      },
    });

    const update = buildAcceptPendingTurnStateUpdate({
      deps: stateRuntimeDeps,
      pendingTurn: {
        conversationRef: 'conv-state',
        turnRef: 'turn-state',
        userMessageId: 'user-state',
        text: 'hello state',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
      state,
    });

    expect(update).not.toHaveProperty('conversationView');
    expect(update?.workspaces['conv-state']).toEqual(expect.objectContaining({
      messages: rawMessages,
      conversationView,
      sdkLiveTurn: null,
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-state',
      }),
    }));
    expect(update?.workspaces['conv-state'].messages).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        id: 'user-state',
        sourceEventType: 'renderer-compose',
      }),
    ]));
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
