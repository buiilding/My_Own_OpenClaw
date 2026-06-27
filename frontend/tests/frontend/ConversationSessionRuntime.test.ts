/**
 * Covers conversation session runtime. behavior in the frontend test suite.
 */

import {
  DesktopConversationSessionRuntime,
} from '../../src/renderer/app/runtime/desktopConversationSessionRuntime';

const {
  applyChatConversationProjection,
  applyEventChatConversationProjection,
  applyTranscriptSessionUserBinding,
  applyRendererConversationSelection,
  createConversationRef,
  ensureConversationRefForSend,
  hydrateConversationSessionFromMainSnapshot,
  initializeLocalConversationSession,
  resolveCurrentRendererConversationSessionInfo,
  resolveRendererConversationSessionSnapshot,
} = DesktopConversationSessionRuntime;

describe('conversationSessionRuntime', () => {
  test('createConversationRef generates the renderer local conversation prefix', () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('runtime-ref');

    expect(createConversationRef()).toBe('conv_runtime-ref');

    jest.restoreAllMocks();
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

  test('resolveRendererConversationSessionSnapshot prefers transcript conversation refs and normalizes user ids', () => {
    expect(resolveRendererConversationSessionSnapshot({
      transcriptConversationRef: ' conv-session ',
      storeConversationRef: 'conv-store',
      userId: ' user-1 ',
    })).toEqual({
      conversationRef: 'conv-session',
      userId: 'user-1',
    });
  });

  test('resolveRendererConversationSessionSnapshot normalizes missing conversation refs and user ids', () => {
    expect(resolveRendererConversationSessionSnapshot({
      transcriptConversationRef: null,
      storeConversationRef: null,
      userId: ' user-main ',
    })).toEqual({
      conversationRef: null,
      userId: 'user-main',
    });
  });

  test('resolveRendererConversationSessionSnapshot falls back to projected chat conversation refs when transcript session is empty', () => {
    expect(resolveRendererConversationSessionSnapshot({
      transcriptConversationRef: null,
      storeConversationRef: ' conv-store ',
      userId: null,
    })).toEqual({
      conversationRef: 'conv-store',
      userId: null,
    });
  });

  test('resolveCurrentRendererConversationSessionInfo combines transcript info and active chat refs', () => {
    expect(resolveCurrentRendererConversationSessionInfo({
      transcriptSessionInfo: {
        conversationRef: ' conv-session ',
        userId: ' user-1 ',
      },
      activeConversationRef: 'conv-store',
    })).toEqual({
      conversationRef: 'conv-session',
      userId: 'user-1',
    });

    expect(resolveCurrentRendererConversationSessionInfo({
      transcriptSessionInfo: {
        conversationRef: null,
        userId: null,
      },
      activeConversationRef: ' conv-store ',
    })).toEqual({
      conversationRef: 'conv-store',
      userId: null,
    });
  });

  test('resolveCurrentRendererConversationSessionInfo returns stable empty session info', () => {
    const firstEmpty = resolveCurrentRendererConversationSessionInfo({
      transcriptSessionInfo: null,
      activeConversationRef: null,
    });
    const secondEmpty = resolveCurrentRendererConversationSessionInfo({
      transcriptSessionInfo: {
        conversationRef: '',
        userId: '',
      },
      activeConversationRef: '',
    });

    expect(firstEmpty).toEqual({
      conversationRef: null,
      userId: null,
    });
    expect(secondEmpty).toBe(firstEmpty);
  });

  test('initializeLocalConversationSession creates, selects, and annotates a new local conversation', () => {
    const selectConversationRef = jest.fn();
    const onConversationCreated = jest.fn();

    expect(initializeLocalConversationSession({
      createConversationRef: () => 'conv-local',
      selectConversationRef,
      onConversationCreated,
    })).toBe('conv-local');

    expect(selectConversationRef).toHaveBeenCalledWith('conv-local');
    expect(onConversationCreated).toHaveBeenCalledWith('conv-local');
  });

  test('applyChatConversationProjection promotes normalized transcript conversation refs into chat state', () => {
    const setChatConversationRef = jest.fn();

    expect(applyChatConversationProjection({
      nextConversationRef: ' conv-session ',
      activeConversationRef: null,
      setChatConversationRef,
    })).toBe('conv-session');

    expect(setChatConversationRef).toHaveBeenCalledWith('conv-session');
  });

  test('applyChatConversationProjection ignores missing conversation refs and preserves current chat selection', () => {
    const setChatConversationRef = jest.fn();

    expect(applyChatConversationProjection({
      nextConversationRef: '   ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBeNull();

    expect(setChatConversationRef).not.toHaveBeenCalled();
  });

  test('applyChatConversationProjection is a no-op when chat state already matches the requested ref', () => {
    const setChatConversationRef = jest.fn();

    expect(applyChatConversationProjection({
      nextConversationRef: ' conv-current ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBe('conv-current');

    expect(setChatConversationRef).not.toHaveBeenCalled();
  });

  test('applyEventChatConversationProjection promotes explicit user selection refs over an active conversation', () => {
    const setChatConversationRef = jest.fn();

    expect(applyEventChatConversationProjection({
      eventType: 'user_message',
      explicitConversationRef: 'conv-next',
      resolvedConversationRef: ' conv-next ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBe('conv-next');

    expect(setChatConversationRef).toHaveBeenCalledWith('conv-next');
  });

  test('applyEventChatConversationProjection blocks backend-wire local-user-message promotion', () => {
    const setChatConversationRef = jest.fn();

    expect(applyEventChatConversationProjection({
      eventType: 'local-user-message',
      explicitConversationRef: 'conv-next',
      resolvedConversationRef: ' conv-next ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBeNull();

    expect(setChatConversationRef).not.toHaveBeenCalled();
  });

  test('applyEventChatConversationProjection blocks non-local events from stealing active chat focus', () => {
    const setChatConversationRef = jest.fn();

    expect(applyEventChatConversationProjection({
      eventType: 'streaming-response',
      explicitConversationRef: 'conv-next',
      resolvedConversationRef: ' conv-next ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBeNull();

    expect(setChatConversationRef).not.toHaveBeenCalled();
  });

  test('applyEventChatConversationProjection ignores events without explicit conversation identity', () => {
    const setChatConversationRef = jest.fn();

    expect(applyEventChatConversationProjection({
      eventType: 'local-user-message',
      explicitConversationRef: null,
      resolvedConversationRef: 'conv-next',
      activeConversationRef: null,
      setChatConversationRef,
    })).toBeNull();

    expect(setChatConversationRef).not.toHaveBeenCalled();
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

  test('hydrateConversationSessionFromMainSnapshot normalizes and projects the main session snapshot', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const updateTranscriptSession = jest.fn();

    await expect(hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: async () => ({
        conversationRef: ' conv-main ',
        userId: ' user-main ',
      }),
      setTranscriptConversationRef,
      setChatConversationRef,
      updateTranscriptSession,
    })).resolves.toEqual({
      conversationRef: 'conv-main',
      userId: 'user-main',
    });

    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-main');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-main');
    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-main', 'user-main');
  });

  test('hydrateConversationSessionFromMainSnapshot ignores removed snake_case snapshot aliases', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();
    const updateTranscriptSession = jest.fn();

    await expect(hydrateConversationSessionFromMainSnapshot({
      loadMainSessionSnapshot: async () => ({
        conversation_ref: ' conv-main ',
        user_id: ' user-main ',
      }),
      setTranscriptConversationRef,
      setChatConversationRef,
      updateTranscriptSession,
    })).resolves.toEqual({
      conversationRef: null,
      userId: null,
    });

    expect(setTranscriptConversationRef).not.toHaveBeenCalled();
    expect(setChatConversationRef).not.toHaveBeenCalled();
    expect(updateTranscriptSession).not.toHaveBeenCalled();
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
    })).resolves.toEqual({
      conversationRef: null,
      userId: null,
    });

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
    })).resolves.toBe('conv-main');

    expect(hydrateMainSessionSnapshot).toHaveBeenCalledTimes(1);
  });

  test('ensureConversationRefForSend generates a fresh local conversation only when no other source exists', async () => {
    const setTranscriptConversationRef = jest.fn();
    const setChatConversationRef = jest.fn();

    await expect(ensureConversationRefForSend({
      transcriptConversationRef: null,
      storeConversationRef: null,
      setTranscriptConversationRef,
      setChatConversationRef,
      hydrateMainSessionSnapshot: async () => ({
        conversationRef: null,
        userId: null,
      }),
      createConversationRef: () => 'conv-generated',
    })).resolves.toBe('conv-generated');

    expect(setTranscriptConversationRef).toHaveBeenCalledWith('conv-generated');
    expect(setChatConversationRef).toHaveBeenCalledWith('conv-generated');
  });
});
