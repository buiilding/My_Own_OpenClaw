import { DesktopConversationViewWorkspaceRuntime } from '../../frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime';
import type { ConversationView } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts';

const {
  buildConversationViewWorkspaceMutation,
  buildSetConversationViewStateUpdate,
  hasWorkspaceConversationView,
  resolveConversationViewStoreRef,
} = DesktopConversationViewWorkspaceRuntime;

function buildConversationView(conversationRef: string): ConversationView {
  return {
    conversationRef,
    revisionId: null,
    displayRows: [],
    liveTurn: {
      turnRef: null,
      phase: 'idle',
      entries: [],
      isBusy: false,
      isTerminal: true,
      canStop: false,
    },
    surfaces: {
      pill: {
        mode: 'idle',
      },
      dashboard: {
        mode: 'idle',
      },
      responseOverlay: {
        mode: 'hidden',
        visible: false,
        guardRef: null,
        ownerConversationRef: conversationRef,
        turnRef: null,
      },
    },
    actions: {
      canEdit: false,
      canRetry: false,
      canFork: false,
    },
  };
}

function buildLiveConversationView({
  conversationRef = 'conv-1',
  turnRef = 'turn-1',
}: {
  conversationRef?: string;
  turnRef?: string;
} = {}): ConversationView {
  return {
    ...buildConversationView(conversationRef),
    liveTurn: {
      turnRef,
      phase: 'streaming',
      isBusy: true,
      entries: [{
        id: 'entry-1',
        type: 'llm-text',
        text: 'streaming',
      }],
    },
    surfaces: {
      responseOverlay: {
        mode: 'response',
        visible: true,
        turnRef,
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
      },
    },
  };
}

describe('DesktopConversationViewWorkspaceRuntime', () => {
  test('detects cached conversation views without exposing shape checks to feature code', () => {
    expect(hasWorkspaceConversationView({
      conversationView: buildConversationView('conv-1'),
    })).toBe(true);
    expect(hasWorkspaceConversationView({
      conversationView: buildConversationView(' conv-1 '),
    })).toBe(false);
    expect(hasWorkspaceConversationView({
      conversationView: buildConversationView(''),
    })).toBe(false);
    expect(hasWorkspaceConversationView({
      conversationView: {
        ...buildConversationView('conv-1'),
        liveTurn: [],
      },
    })).toBe(false);
    expect(hasWorkspaceConversationView({
      conversationView: null,
    })).toBe(false);
    expect(hasWorkspaceConversationView({
      conversationView: {
        conversationRef: 'conv-1',
        rows: [],
      },
    })).toBe(false);
    expect(hasWorkspaceConversationView(null)).toBe(false);
  });

  test('resolves a conversation view store ref from exact SDK view identity', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-1',
      view: buildConversationView('conv-1'),
    })).toBe('conv-1');

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-active',
      targetConversationRef: 'conv-view',
      view: buildConversationView('conv-view'),
    })).toBe('conv-view');
  });

  test('rejects repaired conversation view store refs', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-view',
      targetConversationRef: 'conv-view',
      view: buildConversationView(' conv-view '),
    })).toBeNull();

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-view',
      targetConversationRef: 'conv-target',
      view: buildConversationView('conv-view'),
    })).toBeNull();

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-active',
      view: buildConversationView('conv-view'),
    })).toBeNull();
  });

  test('returns null when a view has no resolvable conversation ref', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: null,
      targetConversationRef: null,
      view: {
        ...buildConversationView('conv-1'),
        conversationRef: undefined,
      },
    })).toBeNull();
  });

  test('returns null when workspace view is already current', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView,
      messages: [],
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toBeNull();
  });

  test('updates workspace conversation view without root latest mirror', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');
    const workspace = {
      conversationView: previousView,
      messages: ['keep-ui-state'],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: ['keep-ui-state'],
      },
    });
    expect(mutation?.workspace).not.toBe(workspace);
  });

  test('migrates assistant feedback into explicit renderer annotations when view becomes authoritative', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView: null,
      messages: [
        {
          id: 'assistant-row',
          sender: 'assistant',
          text: 'raw fallback',
          feedback: 'like',
        },
        {
          id: 'user-row',
          sender: 'user',
          text: 'ignore user feedback',
          feedback: 'dislike',
        },
      ],
      rendererAnnotations: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    });

    expect(mutation?.workspace.messages).toBe(workspace.messages);
    expect(mutation?.workspace.rendererAnnotations).toEqual([
      {
        id: 'assistant-row',
        feedback: 'like',
      },
    ]);
  });

  test('does not repair padded assistant feedback ids into renderer annotations', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView: null,
      messages: [
        {
          id: ' assistant-row ',
          sender: 'assistant',
          text: 'raw fallback',
          feedback: 'like',
        },
        {
          id: 'assistant-row-exact',
          sender: 'assistant',
          text: 'raw fallback',
          feedback: 'dislike',
        },
      ],
      rendererAnnotations: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    });

    expect(mutation?.workspace.rendererAnnotations).toEqual([
      {
        id: 'assistant-row-exact',
        feedback: 'dislike',
      },
    ]);
  });

  test('clears explicit renderer annotations when the ConversationView is cleared', () => {
    const workspace = {
      conversationView: buildConversationView('conv-1'),
      messages: [],
      rendererAnnotations: [
        {
          id: 'assistant-row',
          feedback: 'like',
        },
      ],
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView: null,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView: null,
        messages: [],
        rendererAnnotations: [],
      },
    });
  });

  test('updates inactive workspace conversation view the same way', () => {
    const previousView = buildConversationView('conv-old');
    const nextView = buildConversationView('conv-inactive');
    const workspace = {
      conversationView: previousView,
      messages: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: [],
      },
    });
  });

  test('clears same-turn pending bridge when ConversationView becomes authoritative', () => {
    const conversationView = buildLiveConversationView({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: null,
      },
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: false,
        pendingTurn: null,
      },
    });
  });

  test('does not repair padded pending bridge refs when ConversationView becomes authoritative', () => {
    const conversationView = buildLiveConversationView({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
    const pendingTurn = {
      conversationRef: ' conv-1 ',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn,
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: true,
        pendingTurn,
      },
    });
  });

  test('does not repair padded ConversationView turn refs before clearing pending bridge', () => {
    const conversationView = buildLiveConversationView({
      conversationRef: 'conv-1',
      turnRef: ' turn-1 ',
    });
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn,
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: true,
        pendingTurn,
      },
    });
  });

  test('does not repair padded ConversationView terminal phase before clearing pending bridge', () => {
    const conversationView: ConversationView = {
      ...buildConversationView('conv-1'),
      liveTurn: {
        turnRef: 'turn-1',
        phase: ' complete ',
        isBusy: false,
        isTerminal: false,
        entries: [],
      },
      surfaces: {
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          turnRef: 'turn-1',
          guardRef: 'turn-1',
          ownerConversationRef: 'conv-1',
        },
      },
    };
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn,
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: true,
        pendingTurn,
      },
    });
  });

  test('keeps pending bridge when awaiting ConversationView has no replacement rows yet', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    };
    const conversationView: ConversationView = {
      ...buildConversationView('conv-1'),
      displayRows: [],
      liveTurn: {
        turnRef: 'turn-1',
        phase: 'awaiting',
        isBusy: true,
        entries: [],
      },
      surfaces: {
        responseOverlay: {
          mode: 'awaiting',
          visible: true,
          turnRef: 'turn-1',
          guardRef: 'turn-1',
          ownerConversationRef: 'conv-1',
        },
      },
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn,
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: true,
        pendingTurn,
      },
    });
  });

  test('clears pending bridge when ConversationView has the same-turn SDK user row', () => {
    const conversationView: ConversationView = {
      ...buildConversationView('conv-1'),
      displayRows: [{
        id: 'sdk-user-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      }],
      liveTurn: {
        turnRef: 'turn-1',
        phase: 'awaiting',
        isBusy: true,
        entries: [],
      },
      surfaces: {
        responseOverlay: {
          mode: 'awaiting',
          visible: true,
          turnRef: 'turn-1',
          guardRef: 'turn-1',
          ownerConversationRef: 'conv-1',
        },
      },
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: false,
        pendingTurn: null,
      },
    });
  });

  test('keeps unrelated pending bridge when ConversationView is for another turn', () => {
    const conversationView = buildLiveConversationView({
      conversationRef: 'conv-1',
      turnRef: 'turn-view',
    });
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-pending',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: null,
    };
    const workspace = {
      conversationView: null,
      isSending: true,
      pendingTurn,
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
    });

    expect(mutation?.workspace).toEqual({
      conversationView,
      isSending: true,
      pendingTurn,
    });
  });

  test('buildSetConversationViewStateUpdate resolves workspace and applies workspace view update', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');
    const workspace = {
      conversationView: previousView,
      messages: ['keep-ui-state'],
    };
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace, extraState = {}) => ({
        ...currentState,
        ...extraState,
        workspaces: {
          ...currentState.workspaces,
          [workspaceRef]: nextWorkspace,
        },
      })),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildSetConversationViewStateUpdate({
      conversationView: nextView,
      conversationRef: null,
      deps,
      state,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        conversationView: nextView,
        messages: ['keep-ui-state'],
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          conversationView: nextView,
        }),
      },
    }));
  });
});
