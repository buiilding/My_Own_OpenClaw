import {
  createStoreTranscriptPayload,
  expectNthStoreTranscriptCall,
  expectStoreTranscriptCall,
  flushMicrotasks,
  loadTranscriptWriter,
  registerTranscriptWriterSuiteLifecycle,
  setupStoreFailureRetry,
  withSuppressedConsoleWarn,
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
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: {
          request_id: 'corr-1',
          output: 'tool output',
        },
      },
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
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: {
          request_id: 'corr-1',
          output: 'tool output',
        },
      },
    }));
  });

  test('recordToolMessage requeues immediate writes when IPC store fails', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    setupStoreFailureRetry(invokeMock);
    writer.updateTranscriptSession('conv-tool-retry', 'user-tool-retry');

    await withSuppressedConsoleWarn(async () => {
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
      structuredPayload: {
        kind: 'tool-call',
        toolCall: {
          name: 'mouse_control',
          arguments: {
            action: 'move',
          },
        },
      },
    });
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();

    writer.updateTranscriptSession('conv-tool-queued', 'user-tool-queued');
    await flushMicrotasks();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'tool call payload',
      userId: 'user-tool-queued',
      conversationRef: 'conv-tool-queued',
      role: 'assistant',
      messageType: 'tool-call',
      toolName: 'mouse_control',
      correlationId: 'corr-tool-1',
      modelId: 'model-z',
      modelProvider: 'provider-z',
      screenshot: 'artifact-tool',
      structuredPayload: {
        kind: 'tool-call',
        toolCall: {
          name: 'mouse_control',
          arguments: {
            action: 'move',
          },
        },
      },
    }));
  });

  test('requeues queued tool messages when a pending flush write fails', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    setupStoreFailureRetry(invokeMock);

    await withSuppressedConsoleWarn(async () => {
      writer.recordToolMessage('queued tool message 1', {
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      });
      writer.recordToolMessage('queued tool message 2', {
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: {
            request_id: 'corr-2',
            output: 'queued tool message 2',
          },
        },
      });

      writer.updateTranscriptSession('conv-retry-tool', 'user-retry-tool');
      await flushMicrotasks();

      expect(invokeMock).toHaveBeenCalledTimes(1);
      expectNthStoreTranscriptCall(invokeMock, 1, createStoreTranscriptPayload({
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'assistant',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      }));

      writer.updateTranscriptSession('conv-retry-tool', 'user-retry-tool');
      await flushMicrotasks();

      const storeTranscriptCalls = invokeMock.mock.calls.filter(
        (args) => args[0] === 'store-transcript',
      );
      if (storeTranscriptCalls.length !== 3) {
        throw new Error(`Expected 3 store-transcript calls, received ${storeTranscriptCalls.length}`);
      }
      expect(storeTranscriptCalls[1]?.[1]).toEqual(createStoreTranscriptPayload({
        content: 'queued tool message 1',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'assistant',
        messageType: 'tool-call',
        toolName: 'read_file',
        correlationId: 'corr-1',
      }));
      expect(storeTranscriptCalls[2]?.[1]).toEqual(createStoreTranscriptPayload({
        content: 'queued tool message 2',
        userId: 'user-retry-tool',
        conversationRef: 'conv-retry-tool',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: {
            request_id: 'corr-2',
            output: 'queued tool message 2',
          },
        },
      }));
    });
  });
});
