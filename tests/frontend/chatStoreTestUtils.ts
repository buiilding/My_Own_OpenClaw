import {
  DEFAULT_CHAT_WORKSPACE_REF,
  ChatMessage,
  createInitialStreamTracking,
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';

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
