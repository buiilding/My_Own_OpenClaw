import {
  createStoreTranscriptPayload,
  expectNthStoreTranscriptCall,
  expectStoreTranscriptCall,
  flushMicrotasks,
  loadTranscriptWriter,
  registerTranscriptWriterSuiteLifecycle,
  TRANSCRIPT_SESSION_STORAGE_KEY,
} from './TranscriptWriter.testUtils';

describe('TranscriptWriter user + assistant writes', () => {
  registerTranscriptWriterSuiteLifecycle();

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

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'queued user message',
      userId: 'user-1',
      conversationRef: 'conv-1',
      role: 'user',
      messageType: 'user',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshot: 'artifact-1',
      timestamp: '2026-01-01T00:00:00Z',
    }));
  });

  test('recordUserMessage writes immediately when conversation/user provided in options', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordUserMessage('direct user message', {
      conversationRef: 'conv-direct',
      userId: 'user-direct',
      timestamp: '2026-02-01T00:00:00Z',
    });
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'direct user message',
      userId: 'user-direct',
      conversationRef: 'conv-direct',
      role: 'user',
      messageType: 'user',
      timestamp: '2026-02-01T00:00:00Z',
    }));
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
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'retry user message',
        userId: 'user-retry',
        conversationRef: 'conv-retry',
        role: 'user',
        messageType: 'user',
      }));

      writer.updateTranscriptSession('conv-retry', 'user-retry');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expectNthStoreTranscriptCall(invokeMock, 2, createStoreTranscriptPayload({
        content: 'retry user message',
        userId: 'user-retry',
        conversationRef: 'conv-retry',
        role: 'user',
        messageType: 'user',
      }));
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

  test('queues assistant messages until conversation/user ids are available, then flushes', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message', {
      messageType: 'llm-text',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshotRef: 'artifact-1',
    });
    expect(invokeMock).not.toHaveBeenCalled();

    writer.updateTranscriptSession('conv-assistant-queued', 'user-assistant-queued');
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant message',
      userId: 'user-assistant-queued',
      conversationRef: 'conv-assistant-queued',
      role: 'assistant',
      messageType: 'llm-text',
      modelId: 'model-a',
      modelProvider: 'provider-a',
      screenshot: 'artifact-1',
    }));
  });

  test('recordAssistantMessage uses default message type llm-text', async () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-stored', userId: 'stored-user' }),
    );
    const { writer, invokeMock } = loadTranscriptWriter();

    writer.recordAssistantMessage('assistant message');
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant message',
      userId: 'stored-user',
      conversationRef: 'conv-stored',
      role: 'assistant',
      messageType: 'llm-text',
    }));
  });

  test('recordAssistantMessage requeues immediate writes when IPC store fails', async () => {
    const error = new Error('store failed');
    const { writer, invokeMock } = loadTranscriptWriter();
    invokeMock.mockRejectedValueOnce(error).mockResolvedValue(undefined);
    writer.updateTranscriptSession('conv-assistant-retry', 'user-assistant-retry');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      writer.recordAssistantMessage('retry assistant message', {
        messageType: 'llm-text',
      });
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'retry assistant message',
        userId: 'user-assistant-retry',
        conversationRef: 'conv-assistant-retry',
        role: 'assistant',
        messageType: 'llm-text',
      }));

      writer.updateTranscriptSession('conv-assistant-retry', 'user-assistant-retry');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expectNthStoreTranscriptCall(invokeMock, 2, createStoreTranscriptPayload({
        content: 'retry assistant message',
        userId: 'user-assistant-retry',
        conversationRef: 'conv-assistant-retry',
        role: 'assistant',
        messageType: 'llm-text',
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('recordAssistantMessage ignores empty text payloads', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-1', 'user-1');

    writer.recordAssistantMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
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
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'queued user message 1',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
      }));

      writer.updateTranscriptSession('conv-retry-user', 'user-retry-user');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(3);
      expectNthStoreTranscriptCall(invokeMock, 2, createStoreTranscriptPayload({
        content: 'queued user message 1',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
      }));
      expectNthStoreTranscriptCall(invokeMock, 3, createStoreTranscriptPayload({
        content: 'queued user message 2',
        userId: 'user-retry-user',
        conversationRef: 'conv-retry-user',
        role: 'user',
        messageType: 'user',
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
