/**
 * Covers chat message sender utils. behavior in the frontend test suite.
 */

import { DesktopChatSendStateRuntime } from '../../src/renderer/app/runtime/desktopChatSendStateRuntime';

describe('desktopChatSendStateRuntime', () => {
  const {
    hasUserMessages,
    hasPriorUserMessages,
  } = DesktopChatSendStateRuntime;

  test('hasUserMessages detects whether user messages exist', () => {
    expect(hasUserMessages([{ sender: 'assistant' } as any])).toBe(false);
    expect(hasUserMessages([{ sender: 'assistant' } as any, { sender: 'user' } as any])).toBe(true);
  });

  test('hasPriorUserMessages reads ConversationView display rows before raw messages', () => {
    expect(hasPriorUserMessages({
      conversationView: {
        displayRows: [{ role: 'user' }],
      },
      messages: [{ sender: 'assistant' }],
    })).toBe(true);
    expect(hasPriorUserMessages({
      conversationView: {
        displayRows: [{ role: 'assistant' }],
      },
      messages: [{ sender: 'user' }],
    })).toBe(false);
  });

  test('hasPriorUserMessages does not fall back to raw messages under a partial ConversationView', () => {
    expect(hasPriorUserMessages({
      conversationView: {},
      messages: [{ sender: 'user' }],
    })).toBe(false);
  });
});
