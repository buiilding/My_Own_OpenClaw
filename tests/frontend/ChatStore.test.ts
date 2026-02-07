import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [
        {
          id: 'init-message',
          text: 'Hello! How can I help you today?',
          sender: 'assistant',
        },
      ],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
    });
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

  test('clearMessages resets to a fresh assistant greeting message', () => {
    useChatStore.getState().addMessage({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    useChatStore.getState().clearMessages();
    const firstReset = useChatStore.getState().messages;
    expect(firstReset).toHaveLength(1);
    expect(firstReset[0]).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        text: 'Hello! How can I help you today?',
      }),
    );

    useChatStore.getState().clearMessages();
    const secondReset = useChatStore.getState().messages;
    expect(secondReset).toHaveLength(1);
    expect(secondReset[0].id).not.toEqual(firstReset[0].id);
  });
});

