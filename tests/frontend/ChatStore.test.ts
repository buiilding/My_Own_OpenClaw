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
    const tokenCounts = { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 };
    useChatStore.setState({ tokenCounts });
    const beforeSnapshot = useChatStore.getState();
    useChatStore.getState().setTokenCounts(tokenCounts);
    const afterSnapshot = useChatStore.getState();
    expect(afterSnapshot).toBe(beforeSnapshot);
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
