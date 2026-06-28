/**
 * Covers chat message sender utils. behavior in the frontend test suite.
 */

import { DesktopChatSendStateRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSendStateRuntime';

describe('desktopChatSendStateRuntime', () => {
  const {
    hasUserMessages,
    hasPriorUserMessages,
  } = DesktopChatSendStateRuntime;

  function conversationViewWithRows(displayRows: unknown[]) {
    return {
      conversationRef: 'conv-1',
      displayRows,
      liveTurn: {},
      surfaces: {},
      actions: {},
    };
  }

  test('hasUserMessages detects whether user messages exist', () => {
    expect(hasUserMessages([{ sender: 'assistant' } as any])).toBe(false);
    expect(hasUserMessages([{ sender: 'assistant' } as any, { sender: 'user' } as any])).toBe(true);
  });

  test('hasPriorUserMessages reads ConversationView display rows before raw messages', () => {
    expect(hasPriorUserMessages({
      conversationView: conversationViewWithRows([
        {
          id: 'sdk-user-row',
          conversationRef: 'conv-1',
          role: 'user',
          type: 'user_message',
        },
      ]),
      messages: [{ sender: 'assistant' }],
    })).toBe(true);
    expect(hasPriorUserMessages({
      conversationView: conversationViewWithRows([
        { role: 'assistant', type: 'user_message' },
      ]),
      messages: [{ sender: 'user' }],
    })).toBe(false);
    expect(hasPriorUserMessages({
      conversationView: conversationViewWithRows([
        {
          id: 'wrong-conversation-user-row',
          conversationRef: 'conv-other',
          role: 'user',
          type: 'user_message',
        },
      ]),
      messages: [{ sender: 'user' }],
    })).toBe(false);
    expect(hasPriorUserMessages({
      conversationView: conversationViewWithRows([
        { id: '', role: 'user', type: 'user_message' },
        { role: 'user', type: 'user_message' },
      ]),
      messages: [{ sender: 'user' }],
    })).toBe(false);
  });

  test('hasPriorUserMessages falls back to raw messages under a partial ConversationView', () => {
    expect(hasPriorUserMessages({
      conversationView: {},
      messages: [{ sender: 'user' }],
    })).toBe(true);
  });
});
