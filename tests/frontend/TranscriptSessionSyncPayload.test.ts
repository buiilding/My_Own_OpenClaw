/**
 * Covers transcript session sync payload. behavior in the frontend test suite.
 */

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

  test('supports snake_case conversation and user identifiers', () => {
    expect(extractTranscriptSessionSyncPayload({
      conversation_ref: 'conv-2',
      user_id: 'user-2',
    })).toEqual({
      conversationRef: 'conv-2',
      userId: 'user-2',
    });
  });

  test('ignores session aliases because conversationRef owns chat identity', () => {
    expect(extractTranscriptSessionSyncPayload({
      session_id: 'session-2',
      sessionId: 'session-3',
    })).toBeNull();
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
