import {
  DesktopChatInterfacePresentationRuntime,
} from '../../src/renderer/app/runtime/desktopChatInterfacePresentationRuntime';

const {
  buildChatInterfacePresentationState,
  resolveConversationViewStoreRef,
} = DesktopChatInterfacePresentationRuntime;

describe('DesktopChatInterfacePresentationRuntime', () => {
  test('does not project ConversationView action metadata as a global message gate', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        displayRows: [],
        liveTurn: {
          entries: [],
        },
        actions: {
          canEdit: false,
          canRetry: true,
        },
      },
      messages: [],
    });

    expect(state).not.toHaveProperty('canEditMessages');
    expect(state).not.toHaveProperty('canRetryMessages');
    expect(state.activeRevisionId).toBe('rev-1');
  });

  test('projects ConversationView display rows as main chat messages without store messages', () => {
    const staleMessages = [{
      id: 'assistant-row',
      sender: 'user',
      text: 'stale store prompt',
      feedback: 'like',
    }];
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'view prompt',
        }, {
          id: 'assistant-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'view answer',
        }],
        liveTurn: {
          entries: [],
        },
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      messages: staleMessages,
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
        sender: 'user',
        text: 'view prompt',
      }),
      expect.objectContaining({
        id: 'assistant-row',
        sender: 'assistant',
        text: 'view answer',
      }),
    ]);
    expect(state.renderedMessages[1]).not.toHaveProperty('feedback');
    expect(state).not.toHaveProperty('replayFallbackMessages');
  });

  test('applies only explicit renderer annotations to ConversationView rows', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        displayRows: [{
          id: 'assistant-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'assistant',
          type: 'assistant_message',
          content: 'view answer',
        }],
        liveTurn: {
          entries: [],
        },
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      messages: [{
        id: 'assistant-row',
        sender: 'assistant',
        text: 'stale raw answer',
        feedback: 'dislike',
      }],
      rendererAnnotations: [{
        id: 'assistant-row',
        feedback: 'like',
      }],
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'assistant-row',
        text: 'view answer',
        feedback: 'like',
      }),
    ]);
  });

  test('keeps renderer pending bridge beside ConversationView display rows', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'view prompt',
        }],
        liveTurn: {
          entries: [],
        },
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      messages: [],
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
        text: 'view prompt',
      }),
      expect.objectContaining({
        id: 'pending-user',
        text: 'pending prompt',
      }),
    ]);
  });

  test('projects no-view pending bridge without mutating raw messages', () => {
    const messages = [{
      id: 'old-user-row',
      sender: 'user',
      text: 'old prompt',
      turnRef: 'turn-old',
    }];
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'old-user-row',
      }),
    ]);
    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'old-user-row',
        text: 'old prompt',
      }),
      expect.objectContaining({
        id: 'pending-user',
        text: 'pending prompt',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        attachments: null,
      }),
    ]);
  });

  test('does not project no-view pending bridge when a user row already owns the turn', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages: [{
        id: 'sdk-user-row',
        sender: 'user',
        text: 'sdk prompt',
        turnRef: 'turn-pending',
      }],
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'sdk-user-row',
        text: 'sdk prompt',
      }),
    ]);
  });

  test('does not expose legacy global action gates before ConversationView exists', () => {
    const messages = [{
      id: 'legacy-row',
      sender: 'user',
      text: 'legacy prompt',
    }];
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
    });

    expect(state).not.toHaveProperty('canEditMessages');
    expect(state).not.toHaveProperty('canRetryMessages');
    expect(state.activeRevisionId).toBeNull();
    expect(state).not.toHaveProperty('replayFallbackMessages');
  });

  test('renders ConversationView live rows instead of stale raw current-turn rows', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-view',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'view prompt',
        }],
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'view-live',
            type: 'assistant_message',
            text: 'view live answer',
          }],
        },
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-stale',
        phase: 'streaming',
        assistantText: 'stale raw answer',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
      messages: [{
        id: 'user-row',
        sender: 'user',
        text: 'view prompt',
        turnRef: 'turn-view',
      }],
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
        text: 'view prompt',
      }),
      expect.objectContaining({
        id: 'view-live',
        text: 'view live answer',
        turnRef: 'turn-view',
      }),
    ]);
    expect(state.renderedMessages).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        text: 'stale raw answer',
      }),
    ]));
  });

  test('does not fall back to raw current-turn rows when ConversationView live rows are empty', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-view',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'view prompt',
        }],
        liveTurn: {
          turnRef: 'turn-view',
          entries: [],
        },
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-stale',
        phase: 'streaming',
        assistantText: 'stale raw answer',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
      messages: [],
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
        text: 'view prompt',
      }),
    ]);
    expect(state.renderedMessages).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        text: 'stale raw answer',
      }),
    ]));
  });

  test('resolves a conversation view store target ref', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-1',
      view: {
        conversationRef: 'conv-1',
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'new text',
        }],
      },
    })).toBe('conv-1');

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-active',
      targetConversationRef: 'conv-target',
      view: {
        conversationRef: 'conv-view',
        displayRows: [],
      },
    })).toBe('conv-target');
  });

  test('returns null when a view has no resolvable conversation ref', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: null,
      targetConversationRef: null,
      view: {
        displayRows: [],
      },
    })).toBeNull();
  });
});
