import { selectChatInterfaceState } from '../../frontend/src/renderer/features/chat/utils/chatSelectors';

describe('chatSelectors', () => {
  test('selects only chat interface state fields', () => {
    const state = {
      messages: [{ id: '1', text: 'hello', sender: 'user' }],
      isSending: true,
      thinkingStatus: 'thinking',
      tokenCounts: { total_tokens: 42 },
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
    };

    expect(selectChatInterfaceState(state)).toEqual({
      messages: state.messages,
      isSending: true,
      thinkingStatus: 'thinking',
      tokenCounts: { total_tokens: 42 },
    });
  });
});
