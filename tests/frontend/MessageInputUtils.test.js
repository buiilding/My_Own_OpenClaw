import {
  buildOutgoingMessage,
  normalizeMessageForSend,
} from '../../frontend/src/renderer/features/chat/utils/messageInput';

describe('messageInput utils', () => {
  test('returns null for blank/whitespace-only messages', () => {
    expect(normalizeMessageForSend('')).toBeNull();
    expect(normalizeMessageForSend('   \n\t')).toBeNull();
  });

  test('returns trimmed message for non-empty input', () => {
    expect(normalizeMessageForSend('  hello world  ')).toBe('hello world');
  });

  test('buildOutgoingMessage blocks sends while isSending is true', () => {
    expect(buildOutgoingMessage('hello', true)).toBeNull();
  });

  test('buildOutgoingMessage delegates to normalized text when sending is allowed', () => {
    expect(buildOutgoingMessage('  hello world  ', false)).toBe('hello world');
  });
});
