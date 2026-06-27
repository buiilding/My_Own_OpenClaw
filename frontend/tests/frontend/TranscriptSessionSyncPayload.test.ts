/**
 * Covers transcript session sync payload behavior through the renderer runtime.
 */

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: jest.fn(),
    send: jest.fn(),
  },
  ON_CHANNELS: {
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync',
  },
  SEND_CHANNELS: {
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync',
  },
}));

jest.mock('../../src/renderer/infrastructure/transcript/sessionInfoStorage', () => ({
  emitSessionUpdateEvent: jest.fn(),
  persistSessionInfoToStorage: jest.fn(),
  readSessionInfoFromStorage: jest.fn(() => ({ conversationRef: null, userId: null })),
}));

import * as TranscriptSessionRuntimeModule from '../../src/renderer/infrastructure/transcript/transcriptSessionRuntime';
import { createTranscriptSessionRuntime } from '../../src/renderer/infrastructure/transcript/transcriptSessionRuntime';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { ON_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { readSessionInfoFromStorage } from '../../src/renderer/infrastructure/transcript/sessionInfoStorage';

function createRuntimeAndHandler() {
  const runtime = createTranscriptSessionRuntime();
  const handler = (IpcBridge.on as jest.Mock).mock.calls[0]?.[1];
  expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.TRANSCRIPT_SESSION_SYNC, expect.any(Function));
  return { runtime, handler };
}

describe('transcript session sync payload handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readSessionInfoFromStorage as jest.Mock).mockReturnValue({ conversationRef: null, userId: null });
  });

  test('keeps the raw transcript session sync parser private to the runtime', () => {
    expect(TranscriptSessionRuntimeModule).not.toHaveProperty('extractTranscriptSessionSyncPayload');
  });

  test('ignores non-object payloads', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    handler(null);
    handler('abc');
    handler([]);

    expect(runtime.getTranscriptSessionInfo()).toEqual({ conversationRef: null, userId: null });
  });

  test('extracts camelCase conversation and user identifiers', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    handler({
      conversationRef: ' conv-1 ',
      userId: ' user-1 ',
    });

    expect(runtime.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
    expect(IpcBridge.send).not.toHaveBeenCalled();
  });

  test('rejects snake_case conversation and user aliases', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    expect(() => handler({
      conversation_ref: 'conv-2',
      user_id: 'user-2',
    })).toThrow(
      'Transcript session sync payloads must use conversationRef and userId; conversation_ref and user_id are not supported.',
    );
    expect(runtime.getTranscriptSessionInfo()).toEqual({ conversationRef: null, userId: null });
  });

  test('rejects session aliases because conversationRef owns chat identity', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    expect(() => handler({
      session_id: 'session-2',
      sessionId: 'session-3',
    })).toThrow(
      'Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.',
    );
    expect(runtime.getTranscriptSessionInfo()).toEqual({ conversationRef: null, userId: null });
  });

  test('rejects session aliases even when canonical fields are present', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    expect(() => handler({
      conversationRef: 'conv-2',
      sessionId: 'session-2',
      userId: 'user-2',
    })).toThrow(
      'Transcript session sync payloads must use conversationRef; sessionId and session_id are not supported.',
    );
    expect(runtime.getTranscriptSessionInfo()).toEqual({ conversationRef: null, userId: null });
  });

  test('supports partial payload updates', () => {
    const { runtime, handler } = createRuntimeAndHandler();

    handler({
      conversationRef: 'conv-3',
    });
    expect(runtime.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-3',
      userId: null,
    });

    handler({
      userId: 'user-3',
    });
    expect(runtime.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-3',
      userId: 'user-3',
    });
  });
});
