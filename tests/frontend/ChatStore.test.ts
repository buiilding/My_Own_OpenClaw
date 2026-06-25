/**
 * Covers chat store. behavior in the frontend test suite.
 */

import {
  buildResponseOverlayDismissalKey,
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  createAssistantSeedMessage,
  resetChatStoreForTests,
} from './chatStoreTestUtils';

describe('chatStore', () => {
  beforeEach(() => {
    resetChatStoreForTests(
      createAssistantSeedMessage({
        id: 'init-message',
        text: 'Hello! How can I help you today?',
      }),
    );
  });

  test('addMessage appends to message list', () => {
    useChatStore.getState().addMessage({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(
      expect.objectContaining({
        id: 'user-1',
        sender: 'user',
        text: 'hello',
      }),
    );
  });

  test('addMessage replaces an existing message with the same id', () => {
    useChatStore.getState().addMessage({
      id: 'bundle-output-1',
      text: 'first projection',
      sender: 'tool',
      type: 'tool-output',
      sourceEventType: 'tool_output',
    });

    useChatStore.getState().addMessage({
      id: 'bundle-output-1',
      text: 'updated projection',
      sender: 'tool',
      type: 'tool-output',
      sourceEventType: 'tool_bundle_output',
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(
      expect.objectContaining({
        id: 'bundle-output-1',
        text: 'updated projection',
        sender: 'tool',
        sourceEventType: 'tool_bundle_output',
      }),
    );
  });

  test('updateMessage merges updates for matching id', () => {
    useChatStore.getState().addMessage({
      id: 'assistant-2',
      text: 'partial',
      sender: 'assistant',
      isComplete: false,
    });

    useChatStore.getState().updateMessage('assistant-2', {
      text: 'complete',
      isComplete: true,
    });

    const updated = useChatStore
      .getState()
      .messages
      .find((message) => message.id === 'assistant-2');

    expect(updated).toEqual(
      expect.objectContaining({
        text: 'complete',
        isComplete: true,
      }),
    );
  });

  test('updateMessage is a no-op when id does not exist', () => {
    const before = useChatStore.getState().messages;

    useChatStore.getState().updateMessage('missing-id', {
      text: 'no-op',
    });

    const after = useChatStore.getState().messages;
    expect(after).toBe(before);
  });

  test('setMessages is a no-op when given existing array reference', () => {
    const before = useChatStore.getState().messages;
    useChatStore.getState().setMessages(before);
    expect(useChatStore.getState().messages).toBe(before);
  });

  test('setMessages indexes hydrated turn refs for targeted conversations', () => {
    useChatStore.getState().setMessages([
      {
        id: 'assistant-turn-message',
        text: 'streamed elsewhere',
        sender: 'assistant',
        turnRef: ' turn-elsewhere ',
      },
    ], 'conv-other');

    expect(useChatStore.getState().resolveConversationRefForTurn('turn-elsewhere')).toBe('conv-other');
    expect(useChatStore.getState().resolveConversationRefForTurn(' turn-elsewhere ')).toBe('conv-other');
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'init-message',
      }),
    ]);
  });

  test('persists response overlay dismissal by conversation, turn, and entry', () => {
    const dismissalTarget = {
      conversationRef: ' conv-overlay ',
      turnRef: ' turn-overlay ',
      responseEntryId: ' assistant-entry ',
    };
    const dismissalKey = buildResponseOverlayDismissalKey(dismissalTarget);

    expect(dismissalKey).toBe('conv-overlay\u0001turn-overlay\u0001assistant-entry');
    expect(useChatStore.getState().isResponseOverlayEntryDismissed(dismissalTarget)).toBe(false);

    useChatStore.getState().dismissResponseOverlayEntry(dismissalTarget);

    expect(useChatStore.getState().isResponseOverlayEntryDismissed(dismissalTarget)).toBe(true);
    expect(useChatStore.getState().dismissedResponseOverlayEntries).toEqual({
      [dismissalKey as string]: true,
    });
  });

  test('setIsSending is a no-op when value is unchanged', () => {
    const beforeSnapshot = useChatStore.getState();
    useChatStore.getState().setIsSending(false);
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  test('setThinkingStatus is a no-op when value is unchanged', () => {
    useChatStore.setState({ thinkingStatus: 'thinking' });
    const beforeSnapshot = useChatStore.getState();
    useChatStore.getState().setThinkingStatus('thinking');
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  test('setTokenCounts is a no-op when value reference is unchanged', () => {
    const tokenCounts = {
      prompt_tokens: 5,
      visible_output_tokens: 1,
      thinking_tokens: 1,
      output_tokens_total: 2,
      total_tokens: 7,
      conversation_tokens: 7,
      usage_source: 'provider' as const,
    };
    useChatStore.setState({ tokenCounts });
    const beforeSnapshot = useChatStore.getState();
    useChatStore.getState().setTokenCounts(tokenCounts);
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  test('clearMessages resets to an empty message list', () => {
    useChatStore.getState().setIsSending(true);
    useChatStore.getState().addMessage({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    useChatStore.getState().clearMessages();
    const firstReset = useChatStore.getState();
    expect(firstReset.messages).toHaveLength(0);
    expect(firstReset.isSending).toBe(false);

    useChatStore.getState().clearMessages();
    const secondReset = useChatStore.getState().messages;
    expect(secondReset).toHaveLength(0);
  });

  test('updateStreamTracking applies updater result', () => {
    useChatStore.getState().updateStreamTracking((current) => ({
      ...current,
      phase: 'streaming',
      activeTurnRef: 'turn-1',
      chunkCount: current.chunkCount + 1,
      eventCount: current.eventCount + 1,
    }));

    expect(useChatStore.getState().streamTracking).toEqual(
      expect.objectContaining({
        phase: 'streaming',
        activeTurnRef: 'turn-1',
        chunkCount: 1,
        eventCount: 1,
      }),
    );
  });

  test('workspace-targeted mutations do not overwrite the active projected state', () => {
    useChatStore.getState().addMessage({
      id: 'stale-workspace-message',
      text: 'offscreen',
      sender: 'assistant',
    }, 'conv-other');

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'init-message',
      }),
    ]);
    expect(useChatStore.getState().getWorkspaceState('conv-other').messages).toEqual([
      expect.objectContaining({
        id: 'stale-workspace-message',
        text: 'offscreen',
      }),
    ]);
  });

  test('inactive current-turn projections stay scoped to their workspace', () => {
    const userProjection = {
      conversationRef: 'conv-user',
      turnRef: 'turn-user',
      phase: 'streaming',
      assistantText: 'visible user response',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        phase: 'streaming',
        typingVisible: false,
        overlayVisible: true,
        hasVisibleContent: true,
        entries: [{ id: 'assistant-user', text: 'visible user response' }],
        overlayIntent: {
          visible: true,
          mode: 'response',
          turnRef: 'turn-user',
          conversationRef: 'conv-user',
        },
      },
    };
    const internalProjection = {
      conversationRef: 'conv-agent-internal',
      turnRef: 'turn-user',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        phase: 'awaiting',
        typingVisible: true,
        overlayVisible: true,
        hasVisibleContent: false,
        entries: [],
        overlayIntent: {
          visible: true,
          mode: 'awaiting',
          turnRef: 'turn-user',
          conversationRef: 'conv-agent-internal',
        },
      },
    };

    useChatStore.getState().setActiveConversationRef('conv-user');
    useChatStore.getState().setCurrentTurnProjection(userProjection, 'conv-user');
    useChatStore.getState().setCurrentTurnProjection(
      internalProjection,
      'conv-agent-internal',
    );

    const state = useChatStore.getState();
    expect(state).not.toHaveProperty('latestCurrentTurnProjection');
    expect(state.currentTurnProjection).toBe(userProjection);
    expect(
      state.getWorkspaceState('conv-agent-internal').currentTurnProjection,
    ).toBe(internalProjection);
  });

  test('switching active conversation projects that workspace state into the top-level fields', () => {
    useChatStore.getState().setIsSending(true, 'conv-other');
    useChatStore.getState().setThinkingStatus('thinking elsewhere', 'conv-other');
    useChatStore.getState().addMessage({
      id: 'other-message',
      text: 'other workspace',
      sender: 'assistant',
    }, 'conv-other');

    useChatStore.getState().setActiveConversationRef('conv-other');

    const state = useChatStore.getState();
    expect(state.activeConversationRef).toBe('conv-other');
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking elsewhere');
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: 'other-message',
        text: 'other workspace',
      }),
    ]);
  });

  test('acceptPendingTurn adds the optimistic user row and marks the conversation busy', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'start now',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: ['note.txt'],
      attachments: [{
        id: 'turn-pending:attachment:000',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        filename: 'note.txt',
        contentType: 'image/png',
        previewSrc: 'data:image/png;base64,inline-image-base64',
      }],
    });

    const state = useChatStore.getState();
    expect(state.activeConversationRef).toBe('conv-pending');
    expect(state.isSending).toBe(true);
    expect(state.pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'start now',
    }));
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: 'user-pending',
        sender: 'user',
        text: 'start now',
        turnRef: 'turn-pending',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        attachmentFilenames: ['note.txt'],
        attachments: [{
          id: 'turn-pending:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'materializing',
          filename: 'note.txt',
          contentType: 'image/png',
          previewSrc: 'data:image/png;base64,inline-image-base64',
        }],
      }),
    ]);
  });

  test('applyPendingTurnBroadcast replays pending state into an empty renderer workspace', () => {
    useChatStore.getState().applyPendingTurnBroadcast({
      kind: 'pending',
      pendingTurn: {
        conversationRef: 'conv-replay',
        turnRef: 'turn-replay',
        userMessageId: 'user-replay',
        text: 'replay this',
        timestamp: '2026-06-16T00:00:00.000Z',
        attachmentFilenames: null,
        attachments: [{
          id: 'turn-replay:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'materializing',
          contentType: 'image/jpeg',
          previewSrc: 'data:image/jpeg;base64,broadcast-image-base64',
        }],
      },
    });

    const state = useChatStore.getState();
    expect(state.activeConversationRef).toBe('conv-replay');
    expect(state.isSending).toBe(true);
    expect(state.pendingTurn?.turnRef).toBe('turn-replay');
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: 'user-replay',
        sender: 'user',
        text: 'replay this',
        turnRef: 'turn-replay',
        attachments: [{
          id: 'turn-replay:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'materializing',
          contentType: 'image/jpeg',
          previewSrc: 'data:image/jpeg;base64,broadcast-image-base64',
        }],
      }),
    ]);
  });

  test('applyPendingTurnBroadcast is a no-op for an echoed pending turn with attachments', () => {
    const pendingTurn = {
      conversationRef: 'conv-echo',
      turnRef: 'turn-echo',
      userMessageId: 'user-echo',
      text: 'keep this bubble stable',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: ['image.png'],
      attachments: [{
        id: 'turn-echo:attachment:000',
        kind: 'image' as const,
        source: 'user_included' as const,
        status: 'ready' as const,
        filename: 'image.png',
        screenshotRef: 'artifact-image',
      }],
    };

    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef: 'conv-echo',
      messages: [],
      pendingTurn,
    });
    const beforeState = useChatStore.getState();
    const beforeMessages = beforeState.messages;

    useChatStore.getState().applyPendingTurnBroadcast({
      kind: 'pending',
      pendingTurn: JSON.parse(JSON.stringify(pendingTurn)),
    });

    const afterState = useChatStore.getState();
    expect(afterState).toBe(beforeState);
    expect(afterState.messages).toBe(beforeMessages);
    expect(afterState.messages).toEqual([
      expect.objectContaining({
        id: 'user-echo',
        attachments: pendingTurn.attachments,
      }),
    ]);
  });

  test('acceptReplayPendingTurn records the superseded turn without marking the replacement superseded', () => {
    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef: 'conv-replay-active',
      messages: [],
      pendingTurn: {
        conversationRef: 'conv-replay-active',
        turnRef: 'turn-new',
        userMessageId: 'user-new',
        text: 'edited question',
        timestamp: '2026-06-16T00:00:00.000Z',
        attachmentFilenames: null,
      },
      supersededTurnRef: 'turn-old',
    });

    expect(useChatStore.getState().getWorkspaceState('conv-replay-active')).toEqual(
      expect.objectContaining({
        pendingTurn: expect.objectContaining({
          turnRef: 'turn-new',
        }),
        supersededTurnRefs: {
          'turn-old': true,
        },
      }),
    );
  });

  test('setCurrentTurnProjection replaces matching pending turn without clearing busy state first', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-sdk',
      turnRef: 'turn-sdk',
      userMessageId: 'user-sdk',
      text: 'handoff',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });

    useChatStore.getState().setCurrentTurnProjection({
      conversationRef: 'conv-sdk',
      turnRef: 'turn-sdk',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        typingVisible: true,
        overlayVisible: true,
        isBusy: true,
        hasVisibleContent: false,
        entries: [],
      },
    });

    const state = useChatStore.getState();
    expect(state.pendingTurn).toBeNull();
    expect(state.currentTurnProjection?.turnRef).toBe('turn-sdk');
    expect(state.isSending).toBe(true);
  });

  test('setCurrentTurnProjection keeps pending turn through non-authoritative same-turn SDK idle', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-sdk-idle',
      turnRef: 'turn-sdk-idle',
      userMessageId: 'user-sdk-idle',
      text: 'handoff idle',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });

    useChatStore.getState().setCurrentTurnProjection({
      conversationRef: 'conv-sdk-idle',
      turnRef: 'turn-sdk-idle',
      phase: 'idle',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        typingVisible: false,
        overlayVisible: false,
        isBusy: false,
        hasVisibleContent: false,
        entries: [],
      },
    });

    const state = useChatStore.getState();
    expect(state.pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-sdk-idle',
      turnRef: 'turn-sdk-idle',
    }));
    expect(state.currentTurnProjection?.turnRef).toBe('turn-sdk-idle');
    expect(state.isSending).toBe(true);
  });

  test('clearPendingTurn clears only the matching pending turn', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
      userMessageId: 'user-clear',
      text: 'clear me',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });

    useChatStore.getState().clearPendingTurn({
      conversationRef: 'conv-other',
      turnRef: 'turn-clear',
    });
    expect(useChatStore.getState().pendingTurn?.turnRef).toBe('turn-clear');
    expect(useChatStore.getState().isSending).toBe(true);

    useChatStore.getState().clearPendingTurn({
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
    });
    expect(useChatStore.getState().pendingTurn).toBeNull();
    expect(useChatStore.getState().isSending).toBe(false);
  });

  test('acceptStoppedTurn clears matching pending turn and local busy state immediately', () => {
    useChatStore.getState().acceptPendingTurn({
      conversationRef: 'conv-stop-pending',
      turnRef: 'turn-stop-pending',
      userMessageId: 'user-stop-pending',
      text: 'stop pending',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    });
    useChatStore.getState().setThinkingStatus('thinking', 'conv-stop-pending');
    useChatStore.getState().setThinkingSourceEventType('assistant', 'conv-stop-pending');

    useChatStore.getState().acceptStoppedTurn({
      conversationRef: 'conv-stop-pending',
      turnRef: 'turn-stop-pending',
      stoppedAt: '2026-06-16T00:00:01.000Z',
    });

    const state = useChatStore.getState();
    expect(state.pendingTurn).toBeNull();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBeNull();
    expect(state.thinkingSourceEventType).toBeNull();
    expect(state.streamTracking).toEqual(expect.objectContaining({
      phase: 'complete',
      completedAt: '2026-06-16T00:00:01.000Z',
      lastEventType: 'stop-query',
    }));
  });

  test('acceptStoppedTurn ignores stale superseded turns while a replacement is pending', () => {
    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef: 'conv-stale-stop',
      messages: [],
      pendingTurn: {
        conversationRef: 'conv-stale-stop',
        turnRef: 'turn-new',
        userMessageId: 'user-new',
        text: 'edited question',
        timestamp: '2026-06-16T00:00:00.000Z',
        attachmentFilenames: null,
      },
      supersededTurnRef: 'turn-old',
    });
    const beforeState = useChatStore.getState();

    useChatStore.getState().acceptStoppedTurn({
      conversationRef: 'conv-stale-stop',
      turnRef: 'turn-old',
      stoppedAt: '2026-06-16T00:00:01.000Z',
    });

    const state = useChatStore.getState();
    expect(state).toBe(beforeState);
    expect(state.pendingTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-new',
    }));
    expect(state.isSending).toBe(true);
  });

  test('acceptStoppedTurn terminalizes SDK current-turn and preserves visible partial content', () => {
    const currentTurnProjection = {
      conversationRef: 'conv-stop-sdk',
      turnRef: 'turn-stop-sdk',
      phase: 'streaming',
      assistantText: 'partial',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        phase: 'streaming',
        typingVisible: false,
        overlayVisible: true,
        isBusy: true,
        isTerminal: false,
        hasVisibleContent: true,
        entries: [{ id: 'entry-partial', text: 'partial' }],
        overlayIntent: {
          visible: true,
          mode: 'response',
          turnRef: 'turn-stop-sdk',
          conversationRef: 'conv-stop-sdk',
        },
      },
    };
    useChatStore.getState().setActiveConversationRef('conv-stop-sdk');
    useChatStore.getState().setCurrentTurnProjection(currentTurnProjection, 'conv-stop-sdk');

    useChatStore.getState().acceptStoppedTurn({
      conversationRef: 'conv-stop-sdk',
      turnRef: 'turn-stop-sdk',
      currentTurnProjection,
    });

    expect(useChatStore.getState().currentTurnProjection).toEqual(expect.objectContaining({
      phase: 'complete',
      presentation: expect.objectContaining({
        isBusy: false,
        isTerminal: true,
        entries: [{ id: 'entry-partial', text: 'partial' }],
        overlayIntent: expect.objectContaining({
          visible: true,
          mode: 'response',
        }),
      }),
    }));
    expect(useChatStore.getState().currentTurnProjection?.presentation).not.toHaveProperty(
      'typingVisible',
    );
    expect(useChatStore.getState().currentTurnProjection?.presentation).not.toHaveProperty(
      'overlayVisible',
    );
  });
});
