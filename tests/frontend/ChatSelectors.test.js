import {
  selectChatBoxState,
  selectChatInterfaceState,
} from '../../frontend/src/renderer/features/chat/utils/chatSelectors';

describe('chatSelectors', () => {
  test('selects only chat interface state fields', () => {
    const state = {
      messages: [{ id: '1', text: 'hello', sender: 'user' }],
      isSending: true,
      thinkingStatus: 'thinking',
      tokenCounts: { total_tokens: 42 },
      streamTracking: { phase: 'streaming' },
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
    };

    expect(selectChatInterfaceState(state)).toEqual({
      messages: state.messages,
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: { total_tokens: 42 },
      streamTracking: state.streamTracking,
      currentTurnProjection: null,
    });
  });

  test('selects only chatbox state fields', () => {
    const state = {
      messages: [{ id: '1', text: 'hello', sender: 'assistant' }],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: { total_tokens: 42 },
      streamTracking: { phase: 'idle' },
      addMessage: jest.fn(),
    };

    expect(selectChatBoxState(state)).toEqual({
      messages: state.messages,
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      currentTurnProjection: null,
    });
  });

  test('keeps selected object references (no cloning)', () => {
    const messages = [{ id: '1', text: 'hello', sender: 'assistant' }];
    const tokenCounts = { total_tokens: 42 };
    const state = {
      messages,
      isSending: false,
      thinkingStatus: null,
      tokenCounts,
      streamTracking: { phase: 'idle' },
      addMessage: jest.fn(),
    };

    const chatInterface = selectChatInterfaceState(state);
    const chatBox = selectChatBoxState(state);

    expect(chatInterface.messages).toBe(messages);
    expect(chatInterface.tokenCounts).toBe(tokenCounts);
    expect(chatBox.messages).toBe(messages);
  });

  test('does not rebuild active dashboard rows from SDK current-turn state', () => {
    const messages = [
      { id: 'user-1', text: 'old question', sender: 'user', turnRef: 'turn-old' },
      { id: 'assistant-1', text: 'old answer', sender: 'assistant', type: 'llm-text', turnRef: 'turn-old' },
      { id: 'user-2', text: 'new question', sender: 'user', turnRef: 'turn-new' },
      { id: 'stale-active-assistant', text: 'stale partial', sender: 'assistant', type: 'llm-text', turnRef: 'turn-new' },
    ];
    const selected = selectChatInterfaceState({
      messages,
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection: {
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        phase: 'streaming',
        assistantText: 'projected answer',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
      tokenCounts: null,
      streamTracking: { phase: 'streaming' },
    });

    expect(selected.messages).toBe(messages);
  });

  test('keeps dashboard message references stable without projection cloning', () => {
    const messages = [
      { id: 'user-1', text: 'question', sender: 'user', turnRef: 'turn-1' },
      { id: 'assistant-1', text: 'stale partial', sender: 'assistant', type: 'llm-text', turnRef: 'turn-1' },
    ];
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'projected answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const state = {
      messages,
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection,
      tokenCounts: null,
      streamTracking: { phase: 'streaming' },
    };

    const first = selectChatInterfaceState(state);
    const second = selectChatInterfaceState(state);

    expect(first.messages).toBe(second.messages);
  });

  test('does not dedupe dashboard rows in the selector', () => {
    const messages = [
      { id: 'user-1', text: 'question', sender: 'user', turnRef: 'turn-1' },
      {
        id: 'conv-1:turn-1:assistant',
        text: 'older projected answer',
        sender: 'assistant',
        type: 'llm-text',
        turnRef: 'turn-1',
      },
      {
        id: 'conv-1:turn-1:assistant',
        text: 'newer projected answer',
        sender: 'assistant',
        type: 'llm-text',
        turnRef: 'turn-1',
      },
    ];
    const selected = selectChatInterfaceState({
      messages,
      isSending: false,
      thinkingStatus: null,
      currentTurnProjection: null,
      tokenCounts: null,
      streamTracking: { phase: 'complete' },
    });

    expect(selected.messages).toBe(messages);
  });

  test('defaults optional active-workspace fields when not present', () => {
    const selected = selectChatInterfaceState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
    });

    expect(selected).toEqual(expect.objectContaining({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: null,
      currentTurnProjection: null,
    }));
    expect(selected.streamTracking).toEqual(expect.objectContaining({
      phase: 'idle',
    }));
  });

});
