import {
  ChatMessage,
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';

const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

function createInitialStreamTracking() {
  return {
    activeTurnRef: null,
    phase: 'idle',
    startedAt: null,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: null,
    lastEventType: null,
    eventCount: 0,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

export function createAssistantSeedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'init',
    text: 'Hello!',
    sender: 'assistant',
    ...overrides,
  };
}

export function resetChatStoreForTests(
  initialMessage: ChatMessage | null = createAssistantSeedMessage(),
) {
  const messages = initialMessage ? [initialMessage] : [];
  const streamTracking = createInitialStreamTracking();
  useChatStore.setState({
    activeConversationRef: null,
    turnConversationRefs: {},
    workspaces: {
      [DEFAULT_CHAT_WORKSPACE_REF]: {
        messages,
        isSending: false,
        thinkingStatus: null,
        thinkingSourceEventType: null,
        tokenCounts: null,
        streamTracking,
      },
    },
    messages,
    isSending: false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    tokenCounts: null,
    streamTracking,
  });
}
