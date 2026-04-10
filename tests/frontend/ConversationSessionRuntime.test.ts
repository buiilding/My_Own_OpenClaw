import {
  applyTranscriptSessionUserBinding,
  applyRendererConversationSelection,
  EMPTY_MAIN_SESSION_SNAPSHOT,
  applyMainSessionSnapshot,
  ensureConversationRefForSend,
  hydrateConversationSessionFromMainSnapshot,
  normalizeMainSessionSnapshot,
  resolveConversationRefForSend,
  syncTranscriptSessionFromBackendEvent,
  shouldProjectSessionConversationRef,
} from '../../frontend/src/renderer/features/chat/session/conversationSessionRuntime';

describe('conversationSessionRuntime', () => {
  test('normalizes refs through send-resolution path', () => {
    expect(resolveConversationRefForSend(' conv-a ', ' conv-store ')).toEqual({
      conversationRef: 'conv-a',
      source: 'transcript',
    });
    expect(resolveConversationRefForSend('   ', ' conv-store ')).toEqual({
      conversationRef: 'conv-store',
      source: 'store',
    });
    expect(resolveConversationRefForSend('   ', null)).toEqual({
      conversationRef: null,
      source: null,
    });
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

  test('normalizes main session snapshot payload fields', () => {
    expect(normalizeMainSessionSnapshot({
      conversationRef: ' conv-main ',
      userId: ' user-main ',
    })).toEqual({
      conversationRef: 'conv-main',
      userId: 'user-main',
    });

    expect(normalizeMainSessionSnapshot({
      conversation_ref: ' conv-backend ',
      user_id: ' user-backend ',
    })).toEqual({
      conversationRef: 'conv-backend',
      userId: 'user-backend',
    });

    expect(normalizeMainSessionSnapshot({
      session_id: ' conv-legacy ',
      userId: ' user-legacy ',
    })).toEqual({
      conversationRef: 'conv-legacy',
      userId: 'user-legacy',
    });
  });

  test('applyMainSessionSnapshot projects conversation refs and transcript session through shared callbacks', () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const updateTranscriptSession = jest.fn();
    const snapshot = {
      conversationRef: 'conv-main',
      userId: 'user-main',
    };

    expect(applyMainSessionSnapshot(snapshot, {
      setTranscriptConversationRef,
      setChatConversationRef,
      updateTranscriptSession,
    })).toEqual(snapshot);
    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-main');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-main');
    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-main', 'user-main');
  });

  test('applyMainSessionSnapshot still updates transcript session when conversation ref is missing', () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const updateTranscriptSession = jest.fn();
    const snapshot = {
      conversationRef: null,
      userId: 'user-main',
    };

    applyMainSessionSnapshot(snapshot, {
      setTranscriptConversationRef,
      setChatConversationRef,
      updateTranscriptSession,
    });

    expect(setTranscriptConversationRef).not.toHaveBeenCalled();
    expect(setChatConversationRef).not.toHaveBeenCalled();
    expect(updateTranscriptSession).toHaveBeenCalledWith(null, 'user-main');
  });

  test('applyRendererConversationSelection updates transcript session and optionally projects chat store selection', () => {
    const updateTranscriptSession = jest.fn();
    const setChatConversationRef = jest.fn();

    applyRendererConversationSelection({
      conversationRef: 'conv-selected',
      userId: 'user-selected',
      updateTranscriptSession,
      setChatConversationRef,
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-selected', 'user-selected');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-selected');
  });

  test('applyRendererConversationSelection preserves transcript user when user id is omitted', () => {
    const updateTranscriptSession = jest.fn();

    applyRendererConversationSelection({
      conversationRef: null,
      updateTranscriptSession,
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith(null, undefined);
  });

  test('applyTranscriptSessionUserBinding updates transcript user without changing the conversation ref', () => {
    const updateTranscriptSession = jest.fn();

    expect(applyTranscriptSessionUserBinding({
      userId: ' user-bound ',
      updateTranscriptSession,
    })).toBe(true);

    expect(updateTranscriptSession).toHaveBeenCalledWith(undefined, 'user-bound');
  });

  test('applyTranscriptSessionUserBinding ignores invalid user ids', () => {
    const updateTranscriptSession = jest.fn();

    expect(applyTranscriptSessionUserBinding({
      userId: '   ',
      updateTranscriptSession,
    })).toBe(false);

    expect(updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('syncTranscriptSessionFromBackendEvent prefers local-user-message conversation refs over stale active refs', () => {
    const updateTranscriptSession = jest.fn();

    syncTranscriptSessionFromBackendEvent({
      eventType: 'local-user-message',
      eventUserId: 'user-local',
      resolvedConversationRef: ' conv-event ',
      activeConversationRef: ' conv-active ',
      updateTranscriptSession,
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-event', 'user-local');
  });

  test('syncTranscriptSessionFromBackendEvent keeps the active conversation for non-local events', () => {
    const updateTranscriptSession = jest.fn();

    syncTranscriptSessionFromBackendEvent({
      eventType: 'token-count',
      eventUserId: 'user-token',
      resolvedConversationRef: ' conv-event ',
      activeConversationRef: ' conv-active ',
      updateTranscriptSession,
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-active', 'user-token');
  });

  test('syncTranscriptSessionFromBackendEvent falls back to undefined when no conversation refs exist', () => {
    const updateTranscriptSession = jest.fn();

    syncTranscriptSessionFromBackendEvent({
      eventType: 'token-count',
      eventUserId: 'user-none',
      resolvedConversationRef: '   ',
      activeConversationRef: null,
      updateTranscriptSession,
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith(undefined, 'user-none');
  });

  test('hydrateConversationSessionFromMainSnapshot normalizes, projects, and marks unknown inference state', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const updateTranscriptSession = jest.fn();
    const markConversationInferenceSessionUnknown = jest.fn();

    await expect(hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: async () => ({
        conversation_ref: ' conv-main ',
        user_id: ' user-main ',
      }),
      setTranscriptConversationRef,
      setChatConversationRef,
      updateTranscriptSession,
      markConversationInferenceSessionUnknown,
    })).resolves.toEqual({
      conversationRef: 'conv-main',
      userId: 'user-main',
    });

    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-main');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-main');
    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-main', 'user-main');
    expect(markConversationInferenceSessionUnknown).toHaveBeenCalledWith('conv-main');
  });

  test('hydrateConversationSessionFromMainSnapshot returns empty snapshot and reports errors', async () => {
    const onError = jest.fn();

    await expect(hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: async () => {
        throw new Error('ipc down');
      },
      setTranscriptConversationRef: jest.fn(),
      setChatConversationRef: jest.fn(),
      updateTranscriptSession: jest.fn(),
      onError,
    })).resolves.toBe(EMPTY_MAIN_SESSION_SNAPSHOT);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  test('ensureConversationRefForSend reuses store conversation refs and projects them back into transcript state', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();

    await expect(ensureConversationRefForSend({
      transcriptConversationRef: null,
      storeConversationRef: ' conv-store ',
      setTranscriptConversationRef,
      setChatConversationRef,
      hydrateMainSessionSnapshot: jest.fn(),
      createConversationRef: jest.fn(() => 'conv-generated'),
      markConversationInferenceSessionLocalOnly: jest.fn(),
    })).resolves.toBe('conv-store');

    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-store');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-store');
  });

  test('ensureConversationRefForSend falls back to hydrated main snapshot before generating a new conversation', async () => {
    const hydrateMainSessionSnapshot = jest.fn(async () => ({
      conversationRef: 'conv-main',
      userId: 'user-main',
    }));

    await expect(ensureConversationRefForSend({
      transcriptConversationRef: null,
      storeConversationRef: null,
      setTranscriptConversationRef: jest.fn(),
      setChatConversationRef: jest.fn(),
      hydrateMainSessionSnapshot,
      createConversationRef: jest.fn(() => 'conv-generated'),
      markConversationInferenceSessionLocalOnly: jest.fn(),
    })).resolves.toBe('conv-main');

    expect(hydrateMainSessionSnapshot).toHaveBeenCalledTimes(1);
  });

  test('ensureConversationRefForSend generates a fresh local conversation only when no other source exists', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const markConversationInferenceSessionLocalOnly = jest.fn();

    await expect(ensureConversationRefForSend({
      transcriptConversationRef: null,
      storeConversationRef: null,
      setTranscriptConversationRef,
      setChatConversationRef,
      hydrateMainSessionSnapshot: async () => EMPTY_MAIN_SESSION_SNAPSHOT,
      createConversationRef: () => 'conv-generated',
      markConversationInferenceSessionLocalOnly,
    })).resolves.toBe('conv-generated');

    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-generated');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-generated');
    expect(markConversationInferenceSessionLocalOnly).toHaveBeenCalledWith('conv-generated');
  });
});
