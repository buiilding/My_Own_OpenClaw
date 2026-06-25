import { DesktopConversationViewWorkspaceRuntime } from '../../frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime';
import type { ConversationView } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts';

const {
  buildConversationViewWorkspaceMutation,
  buildSetLatestConversationViewStateUpdate,
  buildSetConversationViewStateUpdate,
} = DesktopConversationViewWorkspaceRuntime;

function buildConversationView(conversationRef: string): ConversationView {
  return {
    conversationRef,
    rows: [],
    actions: {
      canEdit: false,
      canRetry: false,
    },
    revisions: [],
    activeRevisionId: null,
    liveTurn: null,
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
  test('returns null when workspace and latest view are already current', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView,
      messages: [],
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: conversationView,
    })).toBeNull();
  });

  test('updates active workspace and latest conversation view together', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');
    const workspace = {
      conversationView: previousView,
      messages: ['keep-ui-state'],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: previousView,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: ['keep-ui-state'],
      },
      hasLatestConversationViewUpdate: true,
      latestConversationView: nextView,
    });
    expect(mutation?.workspace).not.toBe(workspace);
  });

  test('does not update latest conversation view for inactive workspaces', () => {
    const previousView = buildConversationView('conv-old');
    const nextView = buildConversationView('conv-inactive');
    const latestConversationView = buildConversationView('conv-active');
    const workspace = {
      conversationView: previousView,
      messages: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
      isActiveWorkspace: false,
      latestConversationView,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: [],
      },
      hasLatestConversationViewUpdate: false,
      latestConversationView,
    });
  });

  test('can refresh only the active latest view without cloning workspace', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView,
      messages: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: null,
    });

    expect(mutation).toEqual({
      workspace,
      hasLatestConversationViewUpdate: true,
      latestConversationView: conversationView,
    });
    expect(mutation?.workspace).toBe(workspace);
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
      isActiveWorkspace: true,
      latestConversationView: null,
    })).toEqual({
      workspace: {
        conversationView,
        isSending: false,
        pendingTurn: null,
      },
      hasLatestConversationViewUpdate: true,
      latestConversationView: conversationView,
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
      isActiveWorkspace: true,
      latestConversationView: null,
    });

    expect(mutation?.workspace).toEqual({
      conversationView,
      isSending: true,
      pendingTurn,
    });
  });

  test('buildSetConversationViewStateUpdate resolves workspace and applies latest view update', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');
    const workspace = {
      conversationView: previousView,
      messages: ['keep-ui-state'],
    };
    const state = {
      activeConversationRef: 'conv-1',
      latestConversationView: previousView,
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
      isActiveWorkspaceRef: jest.fn(() => true),
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
    expect(deps.isActiveWorkspaceRef).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        conversationView: nextView,
        messages: ['keep-ui-state'],
      }),
      { latestConversationView: nextView },
    );
    expect(nextState).toEqual(expect.objectContaining({
      latestConversationView: nextView,
      workspaces: {
        'conv-1': expect.objectContaining({
          conversationView: nextView,
        }),
      },
    }));
  });

  test('buildSetLatestConversationViewStateUpdate updates latest view when reference changes', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');

    expect(buildSetLatestConversationViewStateUpdate({
      conversationView: nextView,
      state: {
        latestConversationView: previousView,
      },
    })).toEqual({
      latestConversationView: nextView,
    });
  });

  test('buildSetLatestConversationViewStateUpdate no-ops when latest view reference is unchanged', () => {
    const conversationView = buildConversationView('conv-1');

    expect(buildSetLatestConversationViewStateUpdate({
      conversationView,
      state: {
        latestConversationView: conversationView,
      },
    })).toBeNull();
  });
});
