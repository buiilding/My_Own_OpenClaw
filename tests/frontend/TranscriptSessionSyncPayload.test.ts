import { extractTranscriptSessionSyncPayload } from '../../frontend/src/renderer/infrastructure/transcript/sessionSyncPayload';

describe('extractTranscriptSessionSyncPayload', () => {
  test('returns null for non-object payloads', () => {
    expect(extractTranscriptSessionSyncPayload(null)).toBeNull();
    expect(extractTranscriptSessionSyncPayload('abc')).toBeNull();
    expect(extractTranscriptSessionSyncPayload([])).toBeNull();
  });

  test('extracts camelCase conversation and user identifiers', () => {
    expect(extractTranscriptSessionSyncPayload({
      conversationRef: ' conv-1 ',
      userId: ' user-1 ',
    })).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
  });

  test('supports legacy session aliases and snake_case user id', () => {
    expect(extractTranscriptSessionSyncPayload({
      session_id: 'conv-2',
      user_id: 'user-2',
    })).toEqual({
      conversationRef: 'conv-2',
      userId: 'user-2',
    });
  });

  test('supports partial payload updates', () => {
    expect(extractTranscriptSessionSyncPayload({
      conversation_ref: 'conv-3',
    })).toEqual({
      conversationRef: 'conv-3',
      userId: undefined,
    });
    expect(extractTranscriptSessionSyncPayload({
      userId: 'user-3',
    })).toEqual({
      conversationRef: undefined,
      userId: 'user-3',
    });
  });
});
