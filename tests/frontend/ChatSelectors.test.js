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
      streamPhase: 'streaming',
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

  test('defaults optional active-workspace fields when not present', () => {
    const selected = selectChatInterfaceState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
    });

    expect(selected).toEqual({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: null,
      streamPhase: 'idle',
    });
  });

});
