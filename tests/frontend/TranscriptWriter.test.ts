type TranscriptWriterModule = typeof import('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter');

const { TRANSCRIPT_SESSION_STORAGE_KEY } = require(
  '../../frontend/src/renderer/infrastructure/transcript/sessionInfoStorage',
) as typeof import('../../frontend/src/renderer/infrastructure/transcript/sessionInfoStorage');

function loadTranscriptWriter() {
  jest.resetModules();
  const invokeMock = jest.fn().mockResolvedValue(undefined);

  jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
    IpcBridge: { invoke: invokeMock },
    INVOKE_CHANNELS: { STORE_TRANSCRIPT: 'store-transcript' },
  }));

  const writer = require('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter') as TranscriptWriterModule;
  return { writer, invokeMock };
}

describe('TranscriptWriter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });

  test('loads session info from sessionStorage', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 'stored-session', userId: 'stored-user' }),
    );

    const { writer } = loadTranscriptWriter();
    expect(writer.getTranscriptSessionInfo()).toEqual({
      sessionId: 'stored-session',
      userId: 'stored-user',
    });
  });

  test('queues user messages until session/user ids are available, then flushes', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordUserMessage('queued user message', {
      timestamp: '2026-01-01T00:00:00Z',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshotRef: 'artifact-1',
    });
    expect(invokeMock).not.toHaveBeenCalled();

    writer.updateTranscriptSession('session-1', 'user-1');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'queued user message',
      userId: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      messageType: 'user',
      toolName: undefined,
      correlationId: undefined,
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshot: 'artifact-1',
      timestamp: '2026-01-01T00:00:00Z',
    });
  });

  test('emits transcript-session-update event and persists session info on update', () => {
    const { writer } = loadTranscriptWriter();
    const updates: Array<{ sessionId: string | null; userId: string | null }> = [];
    const handler = (event: Event) => {
      updates.push((event as CustomEvent<{ sessionId: string | null; userId: string | null }>).detail);
    };
    window.addEventListener('transcript-session-update', handler);

    writer.updateTranscriptSession('session-2', 'user-2');

    expect(updates).toEqual([{ sessionId: 'session-2', userId: 'user-2' }]);
    expect(window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify({ sessionId: 'session-2', userId: 'user-2' }),
    );

    window.removeEventListener('transcript-session-update', handler);
  });

  test('preserves stored session id when update only provides user id', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 'stored-session', userId: null }),
    );
    const { writer } = loadTranscriptWriter();

    writer.updateTranscriptSession(undefined, 'new-user');

    expect(writer.getTranscriptSessionInfo()).toEqual({
      sessionId: 'stored-session',
      userId: 'new-user',
    });
  });

  test('recordUserMessage writes immediately when session/user provided in options', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordUserMessage('direct user message', {
      sessionId: 'session-direct',
      userId: 'user-direct',
      timestamp: '2026-02-01T00:00:00Z',
    });
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'direct user message',
      userId: 'user-direct',
      sessionId: 'session-direct',
      role: 'user',
      messageType: 'user',
      toolName: undefined,
      correlationId: undefined,
      modelId: undefined,
      modelProvider: undefined,
      screenshot: undefined,
      timestamp: '2026-02-01T00:00:00Z',
    });
  });

  test('recordUserMessage ignores empty text payloads', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('session-1', 'user-1');

    writer.recordUserMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordAssistantMessage is ignored when session info is unavailable', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordAssistantMessage uses default message type llm-text', async () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId: 'stored-session', userId: 'stored-user' }),
    );
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'assistant message',
      userId: 'stored-user',
      sessionId: 'stored-session',
      role: 'assistant',
      messageType: 'llm-text',
      toolName: undefined,
      correlationId: undefined,
      modelId: undefined,
      modelProvider: undefined,
      screenshot: undefined,
      timestamp: undefined,
    });
  });

  test('recordAssistantMessage ignores empty text payloads', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('session-1', 'user-1');

    writer.recordAssistantMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordToolMessage stores tool metadata when session is available', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('session-tool', 'user-tool');

    writer.recordToolMessage('tool output', {
      messageType: 'tool-output',
      toolName: 'read_file',
      correlationId: 'corr-1',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshotRef: 'artifact-1',
    });
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'tool output',
      userId: 'user-tool',
      sessionId: 'session-tool',
      role: 'tool',
      messageType: 'tool-output',
      toolName: 'read_file',
      correlationId: 'corr-1',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshot: 'artifact-1',
      timestamp: undefined,
    });
  });

  test('recordToolMessage ignores empty text payloads', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('session-1', 'user-1');

    writer.recordToolMessage('', { messageType: 'tool-output' });
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('queues tool messages until session/user ids are available, then flushes', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordToolMessage('tool call payload', {
      messageType: 'tool-call',
      toolName: 'mouse_control',
      correlationId: 'corr-tool-1',
      modelId: 'model-z',
      modelProvider: 'provider-z',
      screenshotRef: 'artifact-tool',
    });
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();

    writer.updateTranscriptSession('session-tool-queued', 'user-tool-queued');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'tool call payload',
      userId: 'user-tool-queued',
      sessionId: 'session-tool-queued',
      role: 'tool',
      messageType: 'tool-call',
      toolName: 'mouse_control',
      correlationId: 'corr-tool-1',
      modelId: 'model-z',
      modelProvider: 'provider-z',
      screenshot: 'artifact-tool',
      timestamp: undefined,
    });
  });
});
