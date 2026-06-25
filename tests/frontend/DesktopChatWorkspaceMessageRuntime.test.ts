/**
 * Covers renderer chat workspace message state updates.
 */

import { DesktopChatWorkspaceMessageRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime';

const {
  buildAddMessageStateUpdate,
  buildSetMessagesStateUpdate,
  buildUpdateMessageStateUpdate,
} = DesktopChatWorkspaceMessageRuntime;

function createDeps(workspace) {
  return {
    buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace, extra = {}) => ({
      ...currentState,
      ...extra,
      workspaces: {
        ...currentState.workspaces,
        [workspaceRef]: nextWorkspace,
      },
    })),
    mergeTurnConversationRefs: jest.fn((currentRefs, messages, conversationRef) => {
      const nextRefs = { ...currentRefs };
      for (const message of messages) {
        if (message.turnRef && conversationRef) {
          nextRefs[message.turnRef] = conversationRef;
        }
      }
      return nextRefs;
    }),
    resolveWorkspaceMutationTarget: jest.fn(() => ({
      normalizedConversationRef: 'conv-1',
      workspace,
      workspaceRef: 'conv-1',
    })),
  };
}

describe('DesktopChatWorkspaceMessageRuntime', () => {
  test('buildAddMessageStateUpdate appends messages and indexes turn refs', () => {
    const workspace = {
      messages: [
        { id: 'existing', sender: 'assistant', text: 'old' },
      ],
    };
    const state = {
      turnConversationRefs: {},
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);
    const message = {
      id: 'user-1',
      sender: 'user' as const,
      text: 'hello',
      turnRef: 'turn-1',
    };

    const nextState = buildAddMessageStateUpdate({
      conversationRef: 'conv-1',
      deps,
      message,
      state,
    });

    expect(deps.resolveWorkspaceMutationTarget).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.mergeTurnConversationRefs).toHaveBeenCalledWith({}, [message], 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        messages: [workspace.messages[0], message],
      }),
      {
        turnConversationRefs: {
          'turn-1': 'conv-1',
        },
      },
    );
    expect(nextState).toEqual(expect.objectContaining({
      turnConversationRefs: {
        'turn-1': 'conv-1',
      },
      workspaces: {
        'conv-1': expect.objectContaining({
          messages: [workspace.messages[0], message],
        }),
      },
    }));
  });

  test('buildAddMessageStateUpdate replaces an existing message by id', () => {
    const workspace = {
      messages: [
        { id: 'assistant-1', sender: 'assistant', text: 'old', turnRef: 'turn-1' },
      ],
    };
    const state = {
      turnConversationRefs: {},
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    const nextState = buildAddMessageStateUpdate({
      deps,
      message: {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'new',
        turnRef: 'turn-1',
      },
      state,
    });

    expect(nextState.workspaces['conv-1'].messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'new',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('buildUpdateMessageStateUpdate updates matching messages and indexes changed turn refs', () => {
    const workspace = {
      messages: [
        { id: 'assistant-1', sender: 'assistant', text: 'old' },
      ],
    };
    const state = {
      turnConversationRefs: {},
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    const nextState = buildUpdateMessageStateUpdate({
      deps,
      id: 'assistant-1',
      state,
      updates: {
        text: 'new',
        turnRef: 'turn-2',
      },
    });

    expect(deps.mergeTurnConversationRefs).toHaveBeenCalledWith(
      {},
      [expect.objectContaining({ id: 'assistant-1', text: 'new', turnRef: 'turn-2' })],
      'conv-1',
    );
    expect(nextState.workspaces['conv-1'].messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'new',
        turnRef: 'turn-2',
      }),
    ]);
  });

  test('buildUpdateMessageStateUpdate no-ops when message id is missing', () => {
    const workspace = {
      messages: [
        { id: 'assistant-1', sender: 'assistant', text: 'old' },
      ],
    };
    const deps = createDeps(workspace);

    expect(buildUpdateMessageStateUpdate({
      deps,
      id: 'missing',
      state: {
        turnConversationRefs: {},
        workspaces: {
          'conv-1': workspace,
        },
      },
      updates: { text: 'new' },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildSetMessagesStateUpdate writes new message arrays and no-ops for same elements', () => {
    const message = { id: 'user-1', sender: 'user' as const, text: 'hello', turnRef: 'turn-1' };
    const workspace = {
      messages: [message],
    };
    const state = {
      turnConversationRefs: {},
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    expect(buildSetMessagesStateUpdate({
      deps,
      messages: [message],
      state,
    })).toBeNull();

    const nextMessage = { id: 'assistant-1', sender: 'assistant' as const, text: 'reply', turnRef: 'turn-1' };
    const nextState = buildSetMessagesStateUpdate({
      deps,
      messages: [message, nextMessage],
      state,
    });

    expect(nextState.workspaces['conv-1'].messages).toEqual([message, nextMessage]);
    expect(deps.mergeTurnConversationRefs).toHaveBeenLastCalledWith(
      {},
      [message, nextMessage],
      'conv-1',
    );
  });
});
