import {
  DesktopChatInterfacePresentationRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime';

const {
  buildChatInterfacePresentationState,
  resolveConversationViewStoreRef,
} = DesktopChatInterfacePresentationRuntime;

function sdkConversationView(overrides = {}) {
  return {
    conversationRef: 'conv-1',
    displayRows: [],
    liveTurn: {
      entries: [],
    },
    surfaces: {},
    actions: {
      canEdit: true,
      canRetry: true,
    },
    ...overrides,
  };
}

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
        surfaces: {},
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
        surfaces: {},
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
        surfaces: {},
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
        surfaces: {},
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

  test('keeps cross-conversation pending bridge out of ConversationView rendering', () => {
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-view',
      conversationView: {
        conversationRef: 'conv-view',
        revisionId: 'rev-1',
        displayRows: [{
          id: 'view-row',
          conversationRef: 'conv-view',
          turnRef: 'turn-view',
          index: 0,
          role: 'assistant',
          type: 'assistant_message',
          content: 'view answer',
        }],
        liveTurn: {
          entries: [],
        },
        surfaces: {},
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      messages: [],
      pendingTurn: {
        conversationRef: 'conv-other',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
        text: 'pending prompt from another conversation',
        timestamp: '2026-06-25T12:00:00.000Z',
      },
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'view-row',
        text: 'view answer',
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
      }),
    ]);
    expect(state.renderedMessages[1]).not.toHaveProperty('attachments');
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

  test('keeps partial conversation view objects on the no-view fallback path', () => {
    const messages = [{
      id: 'raw-user-row',
      sender: 'user',
      text: 'raw prompt',
      turnRef: 'turn-live',
    }];
    const sdkLiveTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-live',
      phase: 'streaming',
      assistantText: 'fallback live answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const rendererAnnotations = [];
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        liveTurn: {
          entries: [],
        },
      },
      messages,
      rendererAnnotations,
      sdkLiveTurn,
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: {
        conversationRef: 'conv-1',
        displayRows: [],
      },
      messages,
      rendererAnnotations,
      sdkLiveTurn,
    });

    expect(secondState).toBe(firstState);
    expect(secondState.activeRevisionId).toBeNull();
    expect(secondState.renderedMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'raw-user-row',
        text: 'raw prompt',
      }),
      expect.objectContaining({
        text: 'fallback live answer',
      }),
    ]));
  });

  test('keeps malformed conversation view envelopes on the no-view fallback path', () => {
    const messages = [{
      id: 'raw-user-row',
      sender: 'user',
      text: 'raw prompt',
      turnRef: 'turn-live',
    }];
    const state = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: sdkConversationView({
        conversationRef: ' conv-1 ',
        revisionId: 'rev-malformed',
        liveTurn: [],
        displayRows: [{
          id: 'view-row-ignored',
          conversationRef: ' conv-1 ',
          turnRef: 'turn-live',
          index: 0,
          role: 'assistant',
          type: 'assistant_message',
          content: 'malformed view answer',
        }],
      }),
      messages,
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-live',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'live-entry',
            type: 'llm-text',
            text: 'fallback live answer',
            turnRef: 'turn-live',
          }],
        },
      },
    });

    expect(state.activeRevisionId).toBeNull();
    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'raw-user-row',
        text: 'raw prompt',
      }),
      expect.objectContaining({
        id: 'live-entry',
        text: 'fallback live answer',
        sourceChannel: 'sdk:current-turn',
      }),
    ]);
  });

  test('keeps no-view SDK presentation cached across ignored raw live-turn changes', () => {
    const messages = [];
    const rendererAnnotations = [];
    const presentation = {
      entries: [{
        id: 'live-answer',
        type: 'llm-text',
        text: 'presentation answer',
      }],
    };
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        presentation,
        assistantText: 'ignored raw answer a',
        reasoningText: 'ignored raw thought a',
        toolEvents: [],
      },
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        presentation,
        assistantText: 'ignored raw answer b',
        reasoningText: 'ignored raw thought b',
        toolEvents: [{
          id: 'ignored-tool',
          kind: 'tool_call',
          toolName: 'ignored',
        }],
      },
    });

    expect(secondState).toBe(firstState);
    expect(secondState.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'live-answer',
        text: 'presentation answer',
      }),
    ]);
  });

  test('keeps no-view SDK presentation cached across malformed live-turn identity changes', () => {
    const messages = [];
    const rendererAnnotations = [];
    const presentation = {
      entries: [{
        id: 'live-answer',
        type: 'llm-text',
        text: 'presentation answer',
      }],
    };
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: ' conv-1',
        turnRef: ' turn-1',
        phase: ' streaming',
        presentation,
      },
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: 'conv-1 ',
        turnRef: 'turn-1 ',
        phase: 'streaming ',
        presentation,
      },
    });

    expect(secondState).toBe(firstState);
    expect(secondState.renderedMessages).toEqual([]);
  });

  test('updates no-view SDK presentation when presentation entries change', () => {
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages: [],
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'live-answer-a',
            type: 'llm-text',
            text: 'first presentation answer',
          }],
        },
      },
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages: [],
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'live-answer-b',
            type: 'llm-text',
            text: 'second presentation answer',
          }],
        },
      },
    });

    expect(secondState).not.toBe(firstState);
    expect(secondState.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'live-answer-b',
        text: 'second presentation answer',
      }),
    ]);
  });

  test('updates legacy no-presentation rows when raw live-turn text changes', () => {
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages: [],
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-legacy',
        phase: 'streaming',
        assistantText: 'legacy answer a',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView: null,
      messages: [],
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-legacy',
        phase: 'streaming',
        assistantText: 'legacy answer b',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    });

    expect(secondState).not.toBe(firstState);
    expect(secondState.renderedMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: 'legacy answer b',
      }),
    ]));
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
        surfaces: {},
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

  test('does not suppress ConversationView live rows as raw duplicate materialized messages', () => {
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
        }, {
          id: 'assistant-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-view',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'view live answer final',
        }],
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'view-live',
            type: 'llm-text',
            text: 'view live answer',
          }],
        },
        surfaces: {},
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      messages: [{
        id: 'raw-duplicate',
        sender: 'assistant',
        type: 'llm-text',
        text: 'raw duplicate should not decide view live rows',
        turnRef: 'turn-view',
      }],
    });

    expect(state.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
      }),
      expect.objectContaining({
        id: 'assistant-row',
        text: 'view live answer final',
      }),
      expect.objectContaining({
        id: 'view-live',
        text: 'view live answer',
        turnRef: 'turn-view',
      }),
    ]);
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
        surfaces: {},
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

  test('keeps ConversationView presentation cached across ignored raw live-turn changes', () => {
    const messages = [];
    const rendererAnnotations = [];
    const conversationView = {
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
      surfaces: {},
      actions: {
        canEdit: true,
        canRetry: true,
      },
    };
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-stale-a',
        phase: 'streaming',
        assistantText: 'ignored raw answer',
      },
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView,
      messages,
      rendererAnnotations,
      sdkLiveTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-stale-b',
        phase: 'tool_call',
        assistantText: 'ignored raw tool turn',
      },
    });

    expect(secondState).toBe(firstState);
  });

  test('keeps ConversationView presentation cached across ignored raw message changes', () => {
    const rendererAnnotations = [];
    const conversationView = {
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
      surfaces: {},
      actions: {
        canEdit: true,
        canRetry: true,
      },
    };
    const firstState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView,
      messages: [{
        id: 'stale-raw-a',
        sender: 'user',
        text: 'ignored raw prompt a',
      }],
      rendererAnnotations,
    });
    const secondState = buildChatInterfacePresentationState({
      activeConversationRef: 'conv-1',
      conversationView,
      messages: [{
        id: 'stale-raw-b',
        sender: 'user',
        text: 'ignored raw prompt b',
      }],
      rendererAnnotations,
    });

    expect(secondState).toBe(firstState);
    expect(secondState.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-row',
        text: 'view prompt',
      }),
    ]);
  });

  test('resolves a conversation view store ref from exact SDK view identity', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-1',
      view: sdkConversationView({
        displayRows: [{
          id: 'user-row',
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'new text',
        }],
      }),
    })).toBe('conv-1');

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-active',
      targetConversationRef: 'conv-view',
      view: sdkConversationView({
        conversationRef: 'conv-view',
      }),
    })).toBe('conv-view');
  });

  test('rejects repaired conversation view store refs', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-view',
      targetConversationRef: 'conv-view',
      view: sdkConversationView({
        conversationRef: ' conv-view ',
      }),
    })).toBeNull();

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-view',
      targetConversationRef: 'conv-target',
      view: sdkConversationView({
        conversationRef: 'conv-view',
      }),
    })).toBeNull();

    expect(resolveConversationViewStoreRef({
      activeConversationRef: 'conv-active',
      view: sdkConversationView({
        conversationRef: 'conv-view',
      }),
    })).toBeNull();
  });

  test('returns null when a view has no resolvable conversation ref', () => {
    expect(resolveConversationViewStoreRef({
      activeConversationRef: null,
      targetConversationRef: null,
      view: sdkConversationView({
        conversationRef: undefined,
      }),
    })).toBeNull();
  });
});
