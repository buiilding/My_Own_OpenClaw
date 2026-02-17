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
  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

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

  test('skips redundant persistence and session-update events when session info is unchanged', () => {
    const { writer } = loadTranscriptWriter();
    const updates: Array<{ conversationRef: string | null; userId: string | null }> = [];
    const handler = (event: Event) => {
      updates.push((event as CustomEvent<{ conversationRef: string | null; userId: string | null }>).detail);
    };
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    window.addEventListener('transcript-session-update', handler);

    try {
      writer.updateTranscriptSession('conv-stable', 'user-stable');
      writer.updateTranscriptSession('conv-stable', 'user-stable');
      writer.setActiveConversationRef('conv-stable');

      expect(updates).toEqual([{ conversationRef: 'conv-stable', userId: 'user-stable' }]);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('transcript-session-update', handler);
      setItemSpy.mockRestore();
    }
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

  test('recordUserMessage requeues immediate writes when IPC store fails', async () => {
    const error = new Error('store failed');
    const { writer, invokeMock } = loadTranscriptWriter();
    invokeMock.mockRejectedValueOnce(error).mockResolvedValue(undefined);
    writer.updateTranscriptSession('conv-retry', 'user-retry');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writer.recordUserMessage('retry user message');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenNthCalledWith(1, 'store-transcript', {
        content: 'retry user message',
        userId: 'user-retry',
        conversationRef: 'conv-retry',
        role: 'user',
        messageType: 'user',
        toolName: undefined,
        correlationId: undefined,
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });

      writer.updateTranscriptSession('conv-retry', 'user-retry');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(invokeMock).toHaveBeenNthCalledWith(2, 'store-transcript', {
        content: 'retry user message',
        userId: 'user-retry',
        conversationRef: 'conv-retry',
        role: 'user',
        messageType: 'user',
        toolName: undefined,
        correlationId: undefined,
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
    } finally {
      warnSpy.mockRestore();
    }
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

  test('recordToolMessage requeues immediate writes when IPC store fails', async () => {
    const error = new Error('store failed');
    const { writer, invokeMock } = loadTranscriptWriter();
    invokeMock.mockRejectedValueOnce(error).mockResolvedValue(undefined);
    writer.updateTranscriptSession('conv-tool-retry', 'user-tool-retry');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writer.recordToolMessage('retry tool output', {
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-retry',
      });
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenNthCalledWith(1, 'store-transcript', {
        content: 'retry tool output',
        userId: 'user-tool-retry',
        conversationRef: 'conv-tool-retry',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-retry',
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });

      writer.updateTranscriptSession('conv-tool-retry', 'user-tool-retry');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(invokeMock).toHaveBeenNthCalledWith(2, 'store-transcript', {
        content: 'retry tool output',
        userId: 'user-tool-retry',
        conversationRef: 'conv-tool-retry',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-retry',
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
    } finally {
      warnSpy.mockRestore();
    }
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

  test('setActiveConversationRef(null) clears active conversation and queues new messages', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-initial', 'user-1');
    writer.setActiveConversationRef(null);

    expect(writer.getActiveConversationRef()).toBeNull();

    writer.recordUserMessage('message after clear');
    await flushMicrotasks();
    expect(invokeMock).not.toHaveBeenCalled();

    writer.setActiveConversationRef('conv-new');
    await flushMicrotasks();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('store-transcript', {
      content: 'message after clear',
      userId: 'user-1',
      conversationRef: 'conv-new',
      role: 'user',
      messageType: 'user',
      toolName: undefined,
      correlationId: undefined,
      modelId: undefined,
      modelProvider: undefined,
      screenshot: undefined,
      timestamp: undefined,
    });
  });

  test('requeues queued user messages when a pending flush write fails', async () => {
    const error = new Error('store failed');
    const { writer, invokeMock } = loadTranscriptWriter();
    invokeMock.mockRejectedValueOnce(error).mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writer.recordUserMessage('queued user message 1');
      writer.recordUserMessage('queued user message 2');

      writer.updateTranscriptSession('conv-retry-user', 'user-retry-user');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenNthCalledWith(1, 'store-transcript', {
        content: 'queued user message 1',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
        toolName: undefined,
        correlationId: undefined,
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });

      writer.updateTranscriptSession('conv-retry-user', 'user-retry-user');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(3);
      expect(invokeMock).toHaveBeenNthCalledWith(2, 'store-transcript', {
        content: 'queued user message 1',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
        toolName: undefined,
        correlationId: undefined,
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
      expect(invokeMock).toHaveBeenNthCalledWith(3, 'store-transcript', {
        content: 'queued user message 2',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
        toolName: undefined,
        correlationId: undefined,
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('requeues queued tool messages when a pending flush write fails', async () => {
    const error = new Error('store failed');
    const { writer, invokeMock } = loadTranscriptWriter();
    invokeMock.mockRejectedValueOnce(error).mockResolvedValue(undefined);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writer.recordToolMessage('queued tool message 1', {
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      });
      writer.recordToolMessage('queued tool message 2', {
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
      });

      writer.updateTranscriptSession('conv-retry-tool', 'user-retry-tool');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenNthCalledWith(1, 'store-transcript', {
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });

      writer.updateTranscriptSession('conv-retry-tool', 'user-retry-tool');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(3);
      expect(invokeMock).toHaveBeenNthCalledWith(2, 'store-transcript', {
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
      expect(invokeMock).toHaveBeenNthCalledWith(3, 'store-transcript', {
        content: 'queued tool message 2',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
        modelId: undefined,
        modelProvider: undefined,
        screenshot: undefined,
        timestamp: undefined,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
