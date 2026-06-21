/**
 * Covers chat message sender utils. behavior in the frontend test suite.
 */

import { DesktopChatSendStateRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSendStateRuntime';

describe('desktopChatSendStateRuntime', () => {
  const {
    hasUserMessages,
  } = DesktopChatSendStateRuntime;

  test('hasUserMessages detects whether user messages exist', () => {
    expect(hasUserMessages([{ sender: 'assistant' } as any])).toBe(false);
    expect(hasUserMessages([{ sender: 'assistant' } as any, { sender: 'user' } as any])).toBe(true);
  });
});
