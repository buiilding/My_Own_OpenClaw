import {
  createStoreTranscriptPayload,
  expectNthStoreTranscriptCall,
  expectStoreTranscriptCall,
  flushMicrotasks,
  loadTranscriptWriter,
  registerTranscriptWriterSuiteLifecycle,
  setupStoreFailureRetry,
  TRANSCRIPT_SESSION_STORAGE_KEY,
  withSuppressedConsoleWarn,
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
    const { writer, invokeMock } = loadTranscriptWriter();
    setupStoreFailureRetry(invokeMock);
    writer.updateTranscriptSession('conv-retry', 'user-retry');

    await withSuppressedConsoleWarn(async () => {
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
    });
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

  test('recordAssistantMessage persists transparency payload when provided', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-transparency', 'user-transparency');

    writer.recordAssistantMessage('assistant with transparency', {
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'System prompt text',
        toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        fullUserMessage: {
          content: '<user_query>hello</user_query>',
          metadata: { source: 'user-message-full' },
        },
        fullAssistantMessage: {
          content: 'Raw full assistant completion',
        },
      },
    });
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant with transparency',
      userId: 'user-transparency',
      conversationRef: 'conv-transparency',
      role: 'assistant',
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'System prompt text',
        toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        fullUserMessage: {
          content: '<user_query>hello</user_query>',
          metadata: { source: 'user-message-full' },
        },
        fullAssistantMessage: {
          content: 'Raw full assistant completion',
        },
      },
    }));
  });

  test('recordAssistantMessage sanitizes lone surrogates in transparency systemPrompt', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-transparency-surrogate', 'user-transparency-surrogate');

    writer.recordAssistantMessage('assistant with bad transparency', {
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Prompt with bad surrogate \uDC9D here',
      },
    });
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant with bad transparency',
      userId: 'user-transparency-surrogate',
      conversationRef: 'conv-transparency-surrogate',
      role: 'assistant',
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Prompt with bad surrogate � here',
      },
    }));
  });

  test('recordAssistantMessage preserves emoji in transparency systemPrompt', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-transparency-emoji', 'user-transparency-emoji');

    writer.recordAssistantMessage('assistant with emoji transparency', {
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Prompt with wave 👋 and lone \uDC9D',
      },
    });
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant with emoji transparency',
      userId: 'user-transparency-emoji',
      conversationRef: 'conv-transparency-emoji',
      role: 'assistant',
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Prompt with wave 👋 and lone \uFFFD',
      },
    }));
  });

  test('recordAssistantMessage repairs common mojibake in transparency systemPrompt', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-transparency-mojibake', 'user-transparency-mojibake');

    writer.recordAssistantMessage('assistant mojibake transparency', {
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Active window: â€œWindieOS â€” READMEâ€\u009d',
      },
    });
    await Promise.resolve();

    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'assistant mojibake transparency',
      userId: 'user-transparency-mojibake',
      conversationRef: 'conv-transparency-mojibake',
      role: 'assistant',
      messageType: 'llm-text',
      transparency: {
        systemPrompt: 'Active window: “WindieOS — README”',
      },
    }));
  });

  test('recordAssistantMessage emits transcript-entry-stored event after successful write', async () => {
    const { writer } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-event', 'user-event');

    const updates: Array<Record<string, unknown>> = [];
    const handleStored = (event: Event) => {
      const customEvent = event as CustomEvent;
      updates.push(customEvent.detail);
    };
    window.addEventListener('transcript-entry-stored', handleStored);

    try {
      writer.recordAssistantMessage('assistant event message', {
        messageType: 'llm-text',
      });
      await flushMicrotasks();
    } finally {
      window.removeEventListener('transcript-entry-stored', handleStored);
    }

    expect(updates).toEqual([
      expect.objectContaining({
        conversationRef: 'conv-event',
        userId: 'user-event',
        role: 'assistant',
        messageType: 'llm-text',
      }),
    ]);
  });

  test('recordAssistantMessage requeues immediate writes when IPC store fails', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    setupStoreFailureRetry(invokeMock);
    writer.updateTranscriptSession('conv-assistant-retry', 'user-assistant-retry');

    await withSuppressedConsoleWarn(async () => {
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
    });
  });

  test('recordAssistantMessage ignores empty text payloads', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-1', 'user-1');

    writer.recordAssistantMessage('');
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  test('requeues queued user messages when a pending flush write fails', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    setupStoreFailureRetry(invokeMock);

    await withSuppressedConsoleWarn(async () => {
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
    });
  });
});
