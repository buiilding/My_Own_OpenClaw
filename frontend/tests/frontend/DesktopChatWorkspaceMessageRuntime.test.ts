/**
 * Covers renderer chat workspace message state updates.
 */

import { DesktopChatWorkspaceMessageRuntime } from '../../src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime';

const {
  buildAddMessageStateUpdate,
  buildSetMessagesStateUpdate,
  buildUpdateStreamTargetMessageStateUpdate,
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
    recordTurnConversationRefs: jest.fn(),
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
    expect(deps.recordTurnConversationRefs).toHaveBeenCalledWith([message], 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        messages: [workspace.messages[0], message],
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
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

  test('buildAddMessageStateUpdate no-ops when ConversationView is authoritative', () => {
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [
        { id: 'annotation-row', sender: 'assistant' as const, text: '', feedback: 'like' as const },
      ],
    };
    const state = {
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    expect(buildAddMessageStateUpdate({
      deps,
      message: {
        id: 'renderer-error',
        sender: 'assistant',
        text: 'local error',
        type: 'error',
      },
      state,
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
    expect(deps.recordTurnConversationRefs).not.toHaveBeenCalled();
  });

  test('buildUpdateMessageStateUpdate updates matching messages and indexes changed turn refs', () => {
    const workspace = {
      messages: [
        { id: 'assistant-1', sender: 'assistant', text: 'old' },
      ],
    };
    const state = {
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

    expect(deps.recordTurnConversationRefs).toHaveBeenCalledWith(
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

  test('buildUpdateMessageStateUpdate keeps only renderer annotations under ConversationView', () => {
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [
        { id: 'assistant-row', sender: 'assistant' as const, text: 'stale raw text' },
      ],
    };
    const state = {
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    const nextState = buildUpdateMessageStateUpdate({
      deps,
      id: 'assistant-row',
      state,
      updates: {
        feedback: 'dislike',
        text: 'renderer should not replace sdk text',
        turnRef: 'turn-stale',
      },
    });

    expect(deps.recordTurnConversationRefs).not.toHaveBeenCalled();
    expect(nextState.workspaces['conv-1'].messages).toEqual([
      {
        id: 'assistant-row',
        sender: 'assistant',
        text: 'stale raw text',
        feedback: 'dislike',
      },
    ]);
  });

  test('buildUpdateMessageStateUpdate creates annotation records under ConversationView', () => {
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [],
    };
    const state = {
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    const nextState = buildUpdateMessageStateUpdate({
      deps,
      id: 'sdk-row',
      state,
      updates: {
        feedback: 'like',
      },
    });

    expect(nextState.workspaces['conv-1'].messages).toEqual([
      {
        id: 'sdk-row',
        sender: 'assistant',
        text: '',
        feedback: 'like',
      },
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
        workspaces: {
          'conv-1': workspace,
        },
      },
      updates: { text: 'new' },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildUpdateMessageStateUpdate no-ops for non-annotation updates under ConversationView', () => {
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [],
    };
    const deps = createDeps(workspace);

    expect(buildUpdateMessageStateUpdate({
      deps,
      id: 'sdk-row',
      state: {
        workspaces: {
          'conv-1': workspace,
        },
      },
      updates: { text: 'renderer text' },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildUpdateStreamTargetMessageStateUpdate updates the selected stream target', () => {
    const workspace = {
      messages: [
        { id: 'user-1', sender: 'user' as const, text: 'first', turnRef: 'turn-1' },
        { id: 'assistant-1', sender: 'assistant' as const, type: 'llm-text', text: 'one', turnRef: 'turn-1' },
        { id: 'assistant-tool', sender: 'assistant' as const, type: 'tool-output', text: 'tool', turnRef: 'turn-2' },
        { id: 'assistant-2', sender: 'assistant' as const, type: 'llm-text', text: 'two', turnRef: 'turn-2' },
      ],
    };
    const state = {
      workspaces: {
        'conv-1': workspace,
      },
    };
    const deps = createDeps(workspace);

    const nextState = buildUpdateStreamTargetMessageStateUpdate({
      deps,
      state,
      target: {
        kind: 'last_assistant_llm_text',
        turnRef: 'turn-2',
      },
      updates: {
        tokenCounts: {
          usage_source: 'provider',
          total_tokens: 42,
        },
      },
    });

    expect(nextState.workspaces['conv-1'].messages).toEqual([
      workspace.messages[0],
      workspace.messages[1],
      workspace.messages[2],
      expect.objectContaining({
        id: 'assistant-2',
        tokenCounts: {
          usage_source: 'provider',
          total_tokens: 42,
        },
      }),
    ]);
  });

  test('buildUpdateStreamTargetMessageStateUpdate no-ops when no stream target matches', () => {
    const workspace = {
      messages: [
        { id: 'assistant-tool', sender: 'assistant' as const, type: 'tool-output', text: 'tool', turnRef: 'turn-2' },
      ],
    };
    const deps = createDeps(workspace);

    expect(buildUpdateStreamTargetMessageStateUpdate({
      deps,
      state: {
        workspaces: {
          'conv-1': workspace,
        },
      },
      target: {
        kind: 'last_by_sender',
        sender: 'user',
      },
      updates: { text: 'new' },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildUpdateStreamTargetMessageStateUpdate no-ops when ConversationView is authoritative', () => {
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [
        { id: 'assistant-1', sender: 'assistant' as const, type: 'llm-text' as const, text: 'one', turnRef: 'turn-1' },
      ],
    };
    const deps = createDeps(workspace);

    expect(buildUpdateStreamTargetMessageStateUpdate({
      deps,
      state: {
        workspaces: {
          'conv-1': workspace,
        },
      },
      target: {
        kind: 'last_assistant_llm_text',
        turnRef: 'turn-1',
      },
      updates: {
        tokenCounts: {
          usage_source: 'provider',
          total_tokens: 42,
        },
      },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });

  test('buildSetMessagesStateUpdate writes new message arrays and no-ops for same elements', () => {
    const message = { id: 'user-1', sender: 'user' as const, text: 'hello', turnRef: 'turn-1' };
    const workspace = {
      messages: [message],
    };
    const state = {
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
    expect(deps.recordTurnConversationRefs).toHaveBeenLastCalledWith(
      [message, nextMessage],
      'conv-1',
    );
  });

  test('buildSetMessagesStateUpdate no-ops when ConversationView is authoritative', () => {
    const message = { id: 'user-1', sender: 'user' as const, text: 'hello', turnRef: 'turn-1' };
    const workspace = {
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages: [message],
    };
    const deps = createDeps(workspace);

    expect(buildSetMessagesStateUpdate({
      deps,
      messages: [{
        id: 'assistant-1',
        sender: 'assistant',
        text: 'raw replacement',
      }],
      state: {
        workspaces: {
          'conv-1': workspace,
        },
      },
    })).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
    expect(deps.recordTurnConversationRefs).not.toHaveBeenCalled();
  });
});
