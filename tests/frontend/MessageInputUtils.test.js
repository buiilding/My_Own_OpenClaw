import {
  buildOutgoingMessage,
} from '../../frontend/src/renderer/features/chat/utils/messageInput';

describe('messageInput utils', () => {
  test('returns null for blank/whitespace-only messages', () => {
    expect(buildOutgoingMessage('', false)).toBeNull();
    expect(buildOutgoingMessage('   \n\t', false)).toBeNull();
  });

  test('returns trimmed message for non-empty input', () => {
    expect(buildOutgoingMessage('  hello world  ', false)).toBe('hello world');
  });

  test('buildOutgoingMessage blocks sends while isSending is true', () => {
    expect(buildOutgoingMessage('hello', true)).toBeNull();
  });

  test('buildOutgoingMessage delegates to normalized text when sending is allowed', () => {
    expect(buildOutgoingMessage('  hello world  ', false)).toBe('hello world');
  });

  test('buildOutgoingMessage returns null for whitespace even when sending is allowed', () => {
    expect(buildOutgoingMessage('   ', false)).toBeNull();
  });

  test('buildOutgoingMessage includes normalized clipboardImages payload', () => {
    const result = buildOutgoingMessage('  hello  ', false, [
      { base64: 'abc', contentType: 'image/png' },
      { base64: '' },
      null,
    ]);
    expect(result).toEqual({
      text: 'hello',
      clipboardImages: [{ base64: 'abc', contentType: 'image/png' }],
    });
  });
});
