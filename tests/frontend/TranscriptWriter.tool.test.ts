import {
  createStoreTranscriptPayload,
  expectNthStoreTranscriptCall,
  expectStoreTranscriptCall,
  flushMicrotasks,
  loadTranscriptWriter,
  registerTranscriptWriterSuiteLifecycle,
} from './TranscriptWriter.testUtils';

describe('TranscriptWriter tool writes', () => {
  registerTranscriptWriterSuiteLifecycle();

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

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
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
    }));
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
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'retry tool output',
        userId: 'user-tool-retry',
        conversationRef: 'conv-tool-retry',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-retry',
      }));

      writer.updateTranscriptSession('conv-tool-retry', 'user-tool-retry');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expectNthStoreTranscriptCall(invokeMock, 2, createStoreTranscriptPayload({
        content: 'retry tool output',
        userId: 'user-tool-retry',
        conversationRef: 'conv-tool-retry',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-retry',
      }));
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
    await flushMicrotasks();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
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
    }));
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
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      }));

      writer.updateTranscriptSession('conv-retry-tool', 'user-retry-tool');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(3);
      expectNthStoreTranscriptCall(invokeMock, 2, createStoreTranscriptPayload({
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      }));
      expectNthStoreTranscriptCall(invokeMock, 3, createStoreTranscriptPayload({
        content: 'queued tool message 2',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
