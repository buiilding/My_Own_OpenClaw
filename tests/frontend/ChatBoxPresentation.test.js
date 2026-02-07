import {
  getChatBoxStatusText,
  getInteractionModeLabel,
  getLatestAssistantMessage,
  trimPreview,
} from '../../frontend/src/renderer/features/chat/utils/chatBoxPresentation';

describe('chatBoxPresentation utils', () => {
  test('gets latest assistant message excluding tool outputs', () => {
    const messages = [
      { sender: 'assistant', type: 'tool-output', text: 'tool result' },
      { sender: 'assistant', type: 'llm-text', text: 'final response' },
    ];
    expect(getLatestAssistantMessage(messages)).toBe('final response');
  });

  test('returns null when no eligible assistant message exists', () => {
    expect(getLatestAssistantMessage([{ sender: 'user', text: 'hello' }])).toBeNull();
  });

  test('trims previews with ellipsis and handles empty input', () => {
    expect(trimPreview('hello', 10)).toBe('hello');
    expect(trimPreview('123456', 4)).toBe('1234…');
    expect(trimPreview('', 10)).toBe('');
  });

  test('derives status text and interaction labels', () => {
    expect(getChatBoxStatusText('thinking', false)).toBe('Thinking…');
    expect(getChatBoxStatusText('', true)).toBe('Sending…');
    expect(getChatBoxStatusText('', false)).toBe('Ready');
    expect(getInteractionModeLabel('agent')).toBe('Agent');
    expect(getInteractionModeLabel('chat')).toBe('Chat');
  });
});
