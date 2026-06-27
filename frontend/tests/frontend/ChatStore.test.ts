/**
 * Covers chat store. behavior in the frontend test suite.
 */

import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  acceptPendingTurnInChatStore,
  acceptStoppedTurnInChatStore,
  addMessageToChatStore,
  applyPendingTurnBroadcastToChatStore,
  clearMessagesInChatStore,
  clearPendingTurnInChatStore,
  setNoViewSdkLiveTurnInChatStore,
  setIsSendingInChatStore,
  setMessagesInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  setTokenCountsInChatStore,
  updateMessageInChatStore,
  updateStreamTrackingInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';
import {
  createAssistantSeedMessage,
  resetChatStoreForTests,
} from './chatStoreTestUtils';

const {
  resolveRendererConversationRefForTurn,
} = DesktopChatTurnConversationRefRuntime;

function getActiveWorkspace() {
  return useChatStore.getState().getWorkspaceState();
}

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
    addMessageToChatStore({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    const messages = getActiveWorkspace().messages;
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
    addMessageToChatStore({
      id: 'bundle-output-1',
      text: 'first projection',
      sender: 'tool',
      type: 'tool-output',
      sourceEventType: 'tool_output',
    });

    addMessageToChatStore({
      id: 'bundle-output-1',
      text: 'updated projection',
      sender: 'tool',
      type: 'tool-output',
      sourceEventType: 'tool_bundle_output',
    });

    const messages = getActiveWorkspace().messages;
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
    addMessageToChatStore({
      id: 'assistant-2',
      text: 'partial',
      sender: 'assistant',
      isComplete: false,
    });

    updateMessageInChatStore('assistant-2', {
      text: 'complete',
      isComplete: true,
    });

    const updated = useChatStore
      .getState()
      .getWorkspaceState()
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
    const before = getActiveWorkspace().messages;

    updateMessageInChatStore('missing-id', {
      text: 'no-op',
    });

    const after = getActiveWorkspace().messages;
    expect(after).toBe(before);
  });

  test('setMessages is a no-op when given existing array reference', () => {
    const before = getActiveWorkspace().messages;
    setMessagesInChatStore(before);
    expect(getActiveWorkspace().messages).toBe(before);
  });

  test('setMessages indexes hydrated turn refs for targeted conversations', () => {
    setMessagesInChatStore([
      {
        id: 'assistant-turn-message',
        text: 'streamed elsewhere',
        sender: 'assistant',
        turnRef: ' turn-elsewhere ',
      },
    ], 'conv-other');

    expect(resolveRendererConversationRefForTurn('turn-elsewhere')).toBe('conv-other');
    expect(resolveRendererConversationRefForTurn(' turn-elsewhere ')).toBe('conv-other');
    expect(getActiveWorkspace().messages).toEqual([
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
    const dismissalKey = 'conv-overlay\u0001turn-overlay\u0001assistant-entry';

    expect(useChatStore.getState().isResponseOverlayEntryDismissed(dismissalTarget)).toBe(false);

    useChatStore.getState().dismissResponseOverlayEntry(dismissalTarget);

    expect(useChatStore.getState().isResponseOverlayEntryDismissed(dismissalTarget)).toBe(true);
    expect(useChatStore.getState().dismissedResponseOverlayEntries).toEqual({
      [dismissalKey as string]: true,
    });
  });

  test('setIsSending is a no-op when value is unchanged', () => {
    const beforeSnapshot = useChatStore.getState();
    setIsSendingInChatStore(false);
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  test('setThinkingStatusInChatStore is a no-op when value is unchanged', () => {
    setThinkingStatusInChatStore('thinking');
    const beforeSnapshot = useChatStore.getState();
    setThinkingStatusInChatStore('thinking');
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
    setTokenCountsInChatStore(tokenCounts);
    const beforeSnapshot = useChatStore.getState();
    setTokenCountsInChatStore(tokenCounts);
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  test('clearMessages resets to an empty message list', () => {
    setIsSendingInChatStore(true);
    addMessageToChatStore({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    clearMessagesInChatStore();
    const firstReset = getActiveWorkspace();
    expect(firstReset.messages).toHaveLength(0);
    expect(firstReset.isSending).toBe(false);

    clearMessagesInChatStore();
    const secondReset = getActiveWorkspace().messages;
    expect(secondReset).toHaveLength(0);
  });

  test('updateStreamTrackingInChatStore applies updater result', () => {
    updateStreamTrackingInChatStore((current) => ({
      ...current,
      phase: 'streaming',
      activeTurnRef: 'turn-1',
      chunkCount: current.chunkCount + 1,
      eventCount: current.eventCount + 1,
    }));

    expect(getActiveWorkspace().streamTracking).toEqual(
      expect.objectContaining({
        phase: 'streaming',
        activeTurnRef: 'turn-1',
        chunkCount: 1,
        eventCount: 1,
      }),
    );
  });

  test('workspace-targeted mutations do not overwrite the active workspace state', () => {
    addMessageToChatStore({
      id: 'stale-workspace-message',
      text: 'offscreen',
      sender: 'assistant',
    }, 'conv-other');

    expect(getActiveWorkspace().messages).toEqual([
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
    setNoViewSdkLiveTurnInChatStore(userProjection, 'conv-user');
    setNoViewSdkLiveTurnInChatStore(
      internalProjection,
      'conv-agent-internal',
    );

    const state = useChatStore.getState();
    expect(state).not.toHaveProperty('latestCurrentTurnProjection');
    expect(state.getWorkspaceState().sdkLiveTurn).toBe(userProjection);
    expect(
      state.getWorkspaceState('conv-agent-internal').sdkLiveTurn,
    ).toBe(internalProjection);
  });

  test('switching active conversation exposes that workspace through the workspace reader', () => {
    setIsSendingInChatStore(true, 'conv-other');
    setThinkingStatusInChatStore('thinking elsewhere', 'conv-other');
    addMessageToChatStore({
      id: 'other-message',
      text: 'other workspace',
      sender: 'assistant',
    }, 'conv-other');

    useChatStore.getState().setActiveConversationRef('conv-other');

    const state = useChatStore.getState();
    const activeWorkspace = state.getWorkspaceState();
    expect(state.activeConversationRef).toBe('conv-other');
    expect(activeWorkspace.isSending).toBe(true);
    expect(activeWorkspace.thinkingStatus).toBe('thinking elsewhere');
    expect(activeWorkspace.messages).toEqual([
      expect.objectContaining({
        id: 'other-message',
        text: 'other workspace',
      }),
    ]);
  });

  test('acceptPendingTurn stores bridge state without mutating raw messages', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'start now',
      timestamp: '2026-06-16T00:00:00.000Z',
    });

    const state = useChatStore.getState();
    const activeWorkspace = state.getWorkspaceState();
    expect(state.activeConversationRef).toBe('conv-pending');
    expect(activeWorkspace.isSending).toBe(true);
    expect(activeWorkspace.pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'start now',
    }));
    expect(activeWorkspace.messages).toEqual([]);
  });

  test('applyPendingTurnBroadcast replays pending state without raw message rows', () => {
    applyPendingTurnBroadcastToChatStore({
      kind: 'pending',
      pendingTurn: {
        conversationRef: 'conv-replay',
        turnRef: 'turn-replay',
        userMessageId: 'user-replay',
        text: 'replay this',
        timestamp: '2026-06-16T00:00:00.000Z',
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
    const activeWorkspace = state.getWorkspaceState();
    expect(state.activeConversationRef).toBe('conv-replay');
    expect(activeWorkspace.isSending).toBe(true);
    expect(activeWorkspace.pendingTurn?.turnRef).toBe('turn-replay');
    expect(activeWorkspace.messages).toEqual([]);
  });

  test('applyPendingTurnBroadcast is a no-op for an echoed pending turn with ignored attachments', () => {
    const pendingTurn = {
      conversationRef: 'conv-echo',
      turnRef: 'turn-echo',
      userMessageId: 'user-echo',
      text: 'keep this bubble stable',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachments: [{
        id: 'turn-echo:attachment:000',
        kind: 'image' as const,
        source: 'user_included' as const,
        status: 'ready' as const,
        filename: 'image.png',
        screenshotRef: 'artifact-image',
      }],
    };

    acceptPendingTurnInChatStore(pendingTurn);
    const beforeState = useChatStore.getState();
    const beforeMessages = beforeState.getWorkspaceState().messages;

    applyPendingTurnBroadcastToChatStore({
      kind: 'pending',
      pendingTurn: JSON.parse(JSON.stringify(pendingTurn)),
    });

    const afterState = useChatStore.getState();
    expect(afterState).toBe(beforeState);
    expect(afterState.getWorkspaceState().messages).toBe(beforeMessages);
    expect(afterState.getWorkspaceState().messages).toEqual([]);
  });

  test('setCurrentTurnProjection replaces matching pending turn without clearing busy state first', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-sdk',
      turnRef: 'turn-sdk',
      userMessageId: 'user-sdk',
      text: 'handoff',
      timestamp: '2026-06-16T00:00:00.000Z',
    });

    setNoViewSdkLiveTurnInChatStore({
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
    const activeWorkspace = state.getWorkspaceState();
    expect(activeWorkspace.pendingTurn).toBeNull();
    expect(activeWorkspace.sdkLiveTurn?.turnRef).toBe('turn-sdk');
    expect(activeWorkspace.isSending).toBe(true);
  });

  test('setCurrentTurnProjection keeps pending turn through non-authoritative same-turn SDK idle', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-sdk-idle',
      turnRef: 'turn-sdk-idle',
      userMessageId: 'user-sdk-idle',
      text: 'handoff idle',
      timestamp: '2026-06-16T00:00:00.000Z',
    });

    setNoViewSdkLiveTurnInChatStore({
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
    const activeWorkspace = state.getWorkspaceState();
    expect(activeWorkspace.pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-sdk-idle',
      turnRef: 'turn-sdk-idle',
    }));
    expect(activeWorkspace.sdkLiveTurn?.turnRef).toBe('turn-sdk-idle');
    expect(activeWorkspace.isSending).toBe(true);
  });

  test('clearPendingTurn clears only the matching pending turn', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
      userMessageId: 'user-clear',
      text: 'clear me',
      timestamp: '2026-06-16T00:00:00.000Z',
    });

    clearPendingTurnInChatStore({
      conversationRef: 'conv-other',
      turnRef: 'turn-clear',
    });
    expect(getActiveWorkspace().pendingTurn?.turnRef).toBe('turn-clear');
    expect(getActiveWorkspace().isSending).toBe(true);

    clearPendingTurnInChatStore({
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
    });
    expect(getActiveWorkspace().pendingTurn).toBeNull();
    expect(getActiveWorkspace().isSending).toBe(false);
  });

  test('acceptStoppedTurn clears matching pending turn and local busy state immediately', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-stop-pending',
      turnRef: 'turn-stop-pending',
      userMessageId: 'user-stop-pending',
      text: 'stop pending',
      timestamp: '2026-06-16T00:00:00.000Z',
    });
    setThinkingStatusInChatStore('thinking', 'conv-stop-pending');
    setThinkingSourceEventTypeInChatStore('assistant', 'conv-stop-pending');

    acceptStoppedTurnInChatStore({
      conversationRef: 'conv-stop-pending',
      turnRef: 'turn-stop-pending',
      stoppedAt: '2026-06-16T00:00:01.000Z',
    });

    const state = useChatStore.getState();
    const activeWorkspace = state.getWorkspaceState();
    expect(activeWorkspace.pendingTurn).toBeNull();
    expect(activeWorkspace.isSending).toBe(false);
    expect(activeWorkspace.thinkingStatus).toBeNull();
    expect(activeWorkspace.thinkingSourceEventType).toBeNull();
    expect(activeWorkspace.streamTracking).toEqual(expect.objectContaining({
      phase: 'complete',
      completedAt: '2026-06-16T00:00:01.000Z',
      lastEventType: 'stop-query',
    }));
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
    setNoViewSdkLiveTurnInChatStore(currentTurnProjection, 'conv-stop-sdk');

    acceptStoppedTurnInChatStore({
      conversationRef: 'conv-stop-sdk',
      turnRef: 'turn-stop-sdk',
    });

    expect(getActiveWorkspace().sdkLiveTurn).toEqual(expect.objectContaining({
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
    expect(getActiveWorkspace().sdkLiveTurn?.presentation).not.toHaveProperty(
      'typingVisible',
    );
    expect(getActiveWorkspace().sdkLiveTurn?.presentation).not.toHaveProperty(
      'overlayVisible',
    );
  });
});
