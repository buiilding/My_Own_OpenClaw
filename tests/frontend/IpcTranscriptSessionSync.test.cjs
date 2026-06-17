/** @jest-environment node */

const {
  applyTranscriptSessionSync,
} = require('../../frontend/src/main/ipc/ipc_transcript_session_sync.cjs');

describe('ipc_transcript_session_sync', () => {
  test('broadcasts normalized sync payload and returns next bridge session state', () => {
    const broadcastToRenderers = jest.fn();

    expect(applyTranscriptSessionSync({
      payload: { conversationRef: 'conv-next', userId: 'user-next' },
      sender: { id: 'sender-1' },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    })).toEqual({
      normalizedPayload: {
        conversationRef: 'conv-next',
        userId: 'user-next',
      },
      nextConversationRef: 'conv-next',
      nextUserId: 'user-next',
    });

    expect(broadcastToRenderers).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: 'conv-next',
      userId: 'user-next',
    }, { id: 'sender-1' });
  });

  test('ignores unrelated payloads without broadcasting', () => {
    const broadcastToRenderers = jest.fn();

    expect(applyTranscriptSessionSync({
      payload: { nope: true },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    })).toBeNull();

    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('rejects session aliases without broadcasting', () => {
    const broadcastToRenderers = jest.fn();

    expect(() => applyTranscriptSessionSync({
      payload: { session_id: 'session-next', sessionId: 'session-next' },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    })).toThrow(
      'Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.',
    );

    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('broadcasts resolved conversation ref when payload only changes user id', () => {
    const broadcastToRenderers = jest.fn();

    const result = applyTranscriptSessionSync({
      payload: { userId: 'user-next' },
      sender: { id: 'sender-1' },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    });

    expect(result.nextConversationRef).toBe('conv-current');
    expect(result.nextUserId).toBe('user-next');
    expect(broadcastToRenderers).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: 'conv-current',
      userId: 'user-next',
    }, { id: 'sender-1' });
  });

  test('broadcasts explicit conversation null as a clear', () => {
    const broadcastToRenderers = jest.fn();

    const result = applyTranscriptSessionSync({
      payload: { conversationRef: null, userId: 'user-next' },
      sender: { id: 'sender-1' },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    });

    expect(result.nextConversationRef).toBeNull();
    expect(result.nextUserId).toBe('user-next');
    expect(broadcastToRenderers).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: null,
      userId: 'user-next',
    }, { id: 'sender-1' });
  });
});
