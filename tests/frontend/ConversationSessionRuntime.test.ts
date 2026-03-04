import {
  normalizeConversationRef,
  resolveConversationRefForSend,
  shouldProjectSessionConversationRef,
} from '../../frontend/src/renderer/features/chat/session/conversationSessionRuntime';

describe('conversationSessionRuntime', () => {
  test('normalizes only non-empty string refs', () => {
    expect(normalizeConversationRef(' conv-a ')).toBe('conv-a');
    expect(normalizeConversationRef('')).toBeNull();
    expect(normalizeConversationRef('   ')).toBeNull();
    expect(normalizeConversationRef(null)).toBeNull();
  });

  test('projects session conversation only when normalized ref is present', () => {
    expect(shouldProjectSessionConversationRef('conv-1')).toBe(true);
    expect(shouldProjectSessionConversationRef('   ')).toBe(false);
    expect(shouldProjectSessionConversationRef(null)).toBe(false);
  });

  test('prefers transcript ref for send resolution', () => {
    expect(resolveConversationRefForSend('conv-transcript', 'conv-store')).toEqual({
      conversationRef: 'conv-transcript',
      source: 'transcript',
    });
  });

  test('falls back to store ref when transcript ref is missing', () => {
    expect(resolveConversationRefForSend(null, ' conv-store ')).toEqual({
      conversationRef: 'conv-store',
      source: 'store',
    });
  });

  test('returns null source when neither transcript nor store refs exist', () => {
    expect(resolveConversationRefForSend(null, undefined)).toEqual({
      conversationRef: null,
      source: null,
    });
  });
});

