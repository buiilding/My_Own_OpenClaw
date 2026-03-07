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
});
