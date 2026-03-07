import {
  buildPendingUserMessage,
  hasUserMessages,
} from '../../frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils';

describe('chatMessageSenderUtils', () => {
  test('hasUserMessages detects whether user messages exist', () => {
    expect(hasUserMessages([{ sender: 'assistant' } as any])).toBe(false);
    expect(hasUserMessages([{ sender: 'assistant' } as any, { sender: 'user' } as any])).toBe(true);
  });

  test('buildPendingUserMessage creates user message with empty screenshot payload', () => {
    expect(buildPendingUserMessage('msg-1', 'hello')).toEqual({
      id: 'msg-1',
      text: 'hello',
      sender: 'user',
      screenshot: null,
    });
  });
});
