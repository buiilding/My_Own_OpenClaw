import {
  ChatMessage,
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
  useChatStore.getState().clearMessages();
  useChatStore.setState({
    messages: initialMessage ? [initialMessage] : [],
    isSending: false,
    thinkingStatus: null,
    tokenCounts: null,
  });
}
