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
      JSON.stringify({ conversationRef: 'conv-stored', userId: 'stored-user' }),
    );

    const { writer } = loadTranscriptWriter();
    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-stored',
      userId: 'stored-user',
    });
  });

  test('queues user messages until conversation/user ids are available, then flushes', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordUserMessage('queued user message', {
      timestamp: '2026-01-01T00:00:00Z',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshotRef: 'artifact-1',
    });
    expect(invokeMock).not.toHaveBeenCalled();

    writer.updateTranscriptSession('conv-1', 'user-1');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'queued user message',
      userId: 'user-1',
      conversationRef: 'conv-1',
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
    const updates: Array<{ conversationRef: string | null; userId: string | null }> = [];
    const handler = (event: Event) => {
      updates.push((event as CustomEvent<{ conversationRef: string | null; userId: string | null }>).detail);
    };
    window.addEventListener('transcript-session-update', handler);

    writer.updateTranscriptSession('conv-2', 'user-2');

    expect(updates).toEqual([{ conversationRef: 'conv-2', userId: 'user-2' }]);
    expect(window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify({ conversationRef: 'conv-2', userId: 'user-2' }),
    );

    window.removeEventListener('transcript-session-update', handler);
  });

  test('preserves stored conversation ref when update only provides user id', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-stored', userId: null }),
    );
    const { writer } = loadTranscriptWriter();

    writer.updateTranscriptSession(undefined, 'new-user');

    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-stored',
      userId: 'new-user',
    });
  });

  test('recordUserMessage writes immediately when conversation/user provided in options', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordUserMessage('direct user message', {
      conversationRef: 'conv-direct',
      userId: 'user-direct',
      timestamp: '2026-02-01T00:00:00Z',
    });
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'direct user message',
      userId: 'user-direct',
      conversationRef: 'conv-direct',
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
    writer.updateTranscriptSession('conv-1', 'user-1');

    writer.recordUserMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordAssistantMessage is ignored when conversation info is unavailable', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordAssistantMessage uses default message type llm-text', async () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-stored', userId: 'stored-user' }),
    );
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'assistant message',
      userId: 'stored-user',
      conversationRef: 'conv-stored',
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
    writer.updateTranscriptSession('conv-1', 'user-1');

    writer.recordAssistantMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('recordToolMessage stores tool metadata when conversation is available', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-tool', 'user-tool');

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
      conversationRef: 'conv-tool',
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
    writer.updateTranscriptSession('conv-1', 'user-1');

    writer.recordToolMessage('', { messageType: 'tool-output' });
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('queues tool messages until conversation/user ids are available, then flushes', async () => {
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

    writer.updateTranscriptSession('conv-tool-queued', 'user-tool-queued');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'tool call payload',
      userId: 'user-tool-queued',
      conversationRef: 'conv-tool-queued',
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

  test('setActiveConversationRef updates only conversation identity', () => {
    const { writer } = loadTranscriptWriter();
    writer.updateTranscriptSession(null, 'user-1');

    writer.setActiveConversationRef('conv-active');

    expect(writer.getActiveConversationRef()).toBe('conv-active');
    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-active',
      userId: 'user-1',
    });
  });
});
