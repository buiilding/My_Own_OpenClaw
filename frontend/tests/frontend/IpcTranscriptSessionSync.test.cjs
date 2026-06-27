/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  applyTranscriptSessionSync,
} = require('../../src/main/ipc/ipc_transcript_session_sync.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');

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

  test('rejects snake_case sync aliases without broadcasting', () => {
    const broadcastToRenderers = jest.fn();

    expect(() => applyTranscriptSessionSync({
      payload: { conversation_ref: 'conv-next', user_id: 'user-next' },
      currentConversationRef: 'conv-current',
      currentUserId: 'user-current',
      broadcastToRenderers,
    })).toThrow(
      'Transcript session sync payloads must use conversationRef and userId; conversation_ref and user_id are not supported.',
    );

    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('session identity docs use hosted backend runtime wording', () => {
    const docs = [
      'docs/frontend/main/ipc_query_runtime_and_transcript_sync_helper_reference.md',
      'docs/frontend/renderer/transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md',
      'docs/reference/session_and_transcript_reference.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/concepts/sessions_and_conversations.md',
      'docs/frontend/renderer/settings/settings_surface_change_workflow.md',
    ].map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).join('\n');

    expect(docs).toContain('hosted backend runtime sessions');
    expect(docs).toContain('hosted backend runtime session context');
    expect(docs).toContain('hosted backend runtime identity');
    expect(docs).toContain('hosted backend runtime behavior');
    expect(docs).toContain('hosted backend websocket/session runtime');
    expect(docs).toContain('hosted backend session manager');
    expect(docs).toContain('hosted backend runtime/websocket');
    expect(docs).toContain('hosted backend runtime session and websocket events');
    expect(docs).toContain('| local-runtime transcript row |');
    expect(docs).not.toContain('to backend runtime sessions');
    expect(docs).not.toContain('belong to backend runtime session context');
    expect(docs).not.toContain('`sessionId` is backend runtime identity');
    expect(docs).not.toContain('if backend runtime behavior changes');
    expect(docs).not.toContain('| string | backend websocket/session runtime |');
    expect(docs).not.toContain('| backend session manager |');
    expect(docs).not.toContain('join to a backend runtime');
    expect(docs).not.toContain('| backend runtime/websocket |');
    expect(docs).not.toContain('| `session_id` | backend session/runtime and websocket events |');
    expect(docs).not.toContain('| sidecar transcript row |');
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
