import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
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
    useChatStore.getState().addMessage({
      id: 'user-1',
      text: 'hello',
      sender: 'user',
    });

    useChatStore.getState().clearMessages();
    const firstReset = useChatStore.getState().messages;
    expect(firstReset).toHaveLength(0);

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
});
