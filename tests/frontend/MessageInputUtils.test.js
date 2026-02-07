import { normalizeMessageForSend } from '../../frontend/src/renderer/features/chat/utils/messageInput';

describe('messageInput utils', () => {
  test('returns null for blank/whitespace-only messages', () => {
    expect(normalizeMessageForSend('')).toBeNull();
    expect(normalizeMessageForSend('   \n\t')).toBeNull();
  });

  test('returns trimmed message for non-empty input', () => {
    expect(normalizeMessageForSend('  hello world  ')).toBe('hello world');
  });
});
