import {
  buildDisplayConversation,
  buildRehydrateSnapshot,
  createConversationEvent,
  createInitialConversationRuntimeState,
  InMemoryConversationStore,
  normalizeBackendEventToConversationEvent,
  reduceConversationRuntimeState,
  SdkConversationRuntime,
  ToolExecutionCoordinator,
  type BackendTransport,
  type ConversationEvent,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

function event(
  type: ConversationEvent['type'],
  payload: Record<string, unknown> = {},
): ConversationEvent {
  return createConversationEvent({
    type,
    conversationRef: 'conv-sdk-runtime',
    revisionId: 'rev-1',
    turnRef: 'turn-1',
    source: 'sdk',
    payload,
  });
}

describe('Windie SDK conversation runtime core', () => {
  test('skipped compaction is runtime state, not display output', () => {
    const events = [
      event('user_message', { text: 'run the tool' }),
      event('tool_call', { toolName: 'read_file', requestId: 'req-1', args: { path: 'README.md' } }),
      event('compaction_skipped', { skippedReason: 'insufficient-history' }),
    ];

    const display = buildDisplayConversation(events);

    expect(display.compaction).toMatchObject({
      status: 'skipped',
      skippedReason: 'insufficient-history',
    });
    expect(display.messages.map(message => message.messageType)).toEqual([
      'user_message',
      'tool_call',
    ]);
  });

  test('runtime reducer does not let skipped compaction replace active tool phase', () => {
    const initial = createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1');
    const afterTool = reduceConversationRuntimeState(
      initial,
      event('tool_call', { toolName: 'read_file', requestId: 'req-1' }),
    );
    const afterSkippedCompaction = reduceConversationRuntimeState(
      afterTool,
      event('compaction_skipped', { skippedReason: 'insufficient-history' }),
    );

    expect(afterTool.phase).toBe('tool_call_pending');
    expect(afterSkippedCompaction.phase).toBe('tool_call_pending');
    expect(afterSkippedCompaction.compaction.status).toBe('skipped');
  });

  test('rehydrate projection preserves provider-safe tool linkage', () => {
    const events = [
      event('user_message', { text: 'inspect file' }),
      event('tool_call', {
        text: '',
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
        structuredPayload: {
          tool_calls: [
            {
              id: 'call-read',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: '{"path":"README.md"}',
              },
            },
          ],
        },
      }),
      event('tool_output', {
        text: 'README contents',
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
      }),
    ];

    const snapshot = buildRehydrateSnapshot(events);

    expect(snapshot.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'inspect file' }),
      expect.objectContaining({
        role: 'assistant',
        tool_call_id: 'call-read',
        tool_calls: [
          expect.objectContaining({
            id: 'call-read',
          }),
        ],
      }),
      expect.objectContaining({
        role: 'tool',
        content: 'README contents',
        tool_call_id: 'call-read',
        name: 'read_file',
      }),
    ]);
  });

  test('in-memory store is idempotent and only activates complete compaction snapshots', async () => {
    const store = new InMemoryConversationStore();
    const userEvent = event('user_message', { text: 'hello' });
    await store.appendEvent(userEvent);
    await store.appendEvent(userEvent);
    await store.replaceCompactedReplay({
      generationId: 'gen-partial',
      conversationRef: 'conv-sdk-runtime',
      sourceRevisionId: 'rev-1',
      createdAt: new Date().toISOString(),
      entries: [{ role: 'user', content: 'hello' }],
      entryCount: 2,
      complete: true,
    });

    expect(await store.loadEvents('conv-sdk-runtime')).toHaveLength(1);
    expect(await store.loadCompactedReplay('conv-sdk-runtime')).toBeNull();

    await store.replaceCompactedReplay({
      generationId: 'gen-complete',
      conversationRef: 'conv-sdk-runtime',
      sourceRevisionId: 'rev-1',
      createdAt: new Date().toISOString(),
      entries: [{ role: 'user', content: 'hello' }],
      entryCount: 1,
      complete: true,
    });

    expect(await store.loadCompactedReplay('conv-sdk-runtime')).toMatchObject({
      generationId: 'gen-complete',
      active: true,
    });
  });

  test('in-memory store preserves append order for events with the same timestamp', async () => {
    const store = new InMemoryConversationStore();
    const timestamp = new Date().toISOString();
    const first = createConversationEvent({
      type: 'turn_started',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      eventId: 'z-turn-started',
      timestamp,
    });
    const second = createConversationEvent({
      type: 'assistant_delta',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      eventId: 'a-assistant-delta',
      timestamp,
      payload: { text: 'partial' },
    });

    await store.appendEvents([first, second]);

    expect((await store.loadEvents('conv-sdk-runtime')).map(storedEvent => storedEvent.eventId)).toEqual([
      'z-turn-started',
      'a-assistant-delta',
    ]);
  });

  test('backend compaction-completed with skipped_reason normalizes to compaction_skipped', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'context-compaction-completed',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: {
        skipped_reason: 'insufficient-history',
        before_tokens: 167141,
      },
    });

    expect(normalized).toMatchObject({
      type: 'compaction_skipped',
      conversationRef: 'conv-sdk-runtime',
      payload: expect.objectContaining({
        skippedReason: 'insufficient-history',
      }),
    });
  });

  test('tool coordinator returns explicit failed result for claimed tool execution failure', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: {
        executeTool: jest.fn(async () => {
          throw new Error('sidecar unavailable');
        }),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    const claim = await coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-read',
      args: { path: 'README.md' },
    }));

    expect(claim.claimed).toBe(true);
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-read',
      success: false,
      error: 'sidecar unavailable',
    }));
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-read',
          success: false,
          error: 'sidecar unavailable',
        }),
      }),
    ]);
  });

  test('conversation runtime stores events and sends rehydrate from projection', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const sentRehydrates: Record<string, unknown>[] = [];
    const transport: BackendTransport = {
      connect: jest.fn(async () => undefined),
      handshake: jest.fn(async () => undefined),
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-1';
      }),
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
      sendRehydrate: jest.fn(async payload => {
        sentRehydrates.push(payload);
      }),
      stop: jest.fn(async () => undefined),
      subscribe: jest.fn(() => () => undefined),
      close: jest.fn(async () => undefined),
    };
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });

    await runtime.send({ text: 'hello', turnRef: 'turn-send' });
    const rehydrate = await runtime.rehydrate();

    expect(sentQueries[0]).toMatchObject({
      text: 'hello',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-send',
    });
    expect(rehydrate.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
    ]);
    expect(sentRehydrates[0]).toMatchObject({
      conversation_ref: 'conv-sdk-runtime',
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello' }),
      ],
    });
  });

  test('editAndResend rewrites from the edited user message and sends a new revision turn', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const transport: BackendTransport = {
      connect: jest.fn(async () => undefined),
      handshake: jest.fn(async () => undefined),
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-edited';
      }),
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
      sendRehydrate: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      subscribe: jest.fn(() => () => undefined),
      close: jest.fn(async () => undefined),
    };
    const store = new InMemoryConversationStore();
    const firstUser = createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-old',
      eventId: 'user-keep',
      payload: { text: 'keep this' },
    });
    const editedUser = createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-old',
      eventId: 'user-edit',
      payload: { text: 'old text', artifactRefs: ['artifact-old'] },
    });
    const staleAssistant = createConversationEvent({
      type: 'assistant_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-old',
      eventId: 'assistant-stale',
      payload: { text: 'stale answer' },
    });
    await store.appendEvents([firstUser, editedUser, staleAssistant]);

    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    await runtime.load();
    await runtime.editAndResend({
      messageId: 'user-edit',
      text: 'new text',
      turnRef: 'turn-edited',
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('assistant-stale');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('user-edit');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'user_message',
      'conversation_rewritten',
      'turn_started',
      'user_message',
    ]);
    expect(sentQueries[0]).toMatchObject({
      text: 'new text',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-edited',
      artifactRefs: ['artifact-old'],
    });
    expect(buildDisplayConversation(events).messages.map(message => message.text)).toEqual([
      'keep this',
      'new text',
    ]);
  });

  test('retryTurn cuts stale assistant/tool history and resends the previous user message', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-retry',
        payload: { text: 'try this again' },
      }),
      createConversationEvent({
        type: 'tool_call',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'tool-stale',
        payload: { toolName: 'read_file', requestId: 'req-stale' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'assistant-retry',
        payload: { text: 'bad answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: {
        connect: jest.fn(async () => undefined),
        handshake: jest.fn(async () => undefined),
        sendQuery: jest.fn(async payload => {
          sentQueries.push(payload);
          return 'query-retry';
        }),
        sendToolResult: jest.fn(async () => undefined),
        sendToolBundleResult: jest.fn(async () => undefined),
        sendRehydrate: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
        subscribe: jest.fn(() => () => undefined),
        close: jest.fn(async () => undefined),
      },
    });

    await runtime.load();
    await runtime.retryTurn({
      messageId: 'assistant-retry',
      turnRef: 'turn-retry',
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('tool-stale');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('assistant-retry');
    expect(sentQueries[0]).toMatchObject({
      text: 'try this again',
      turn_ref: 'turn-retry',
    });
  });

  test('rehydrate uses the active complete compacted replay generation when present', async () => {
    const sentRehydrates: Record<string, unknown>[] = [];
    const store = new InMemoryConversationStore();
    await store.appendEvent(event('user_message', { text: 'long original history' }));
    await store.replaceCompactedReplay({
      generationId: 'gen-active',
      conversationRef: 'conv-sdk-runtime',
      sourceRevisionId: 'rev-compact',
      createdAt: new Date().toISOString(),
      entries: [{ role: 'assistant', content: 'summary' }],
      entryCount: 1,
      complete: true,
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: {
        connect: jest.fn(async () => undefined),
        handshake: jest.fn(async () => undefined),
        sendQuery: jest.fn(async () => 'query-unused'),
        sendToolResult: jest.fn(async () => undefined),
        sendToolBundleResult: jest.fn(async () => undefined),
        sendRehydrate: jest.fn(async payload => {
          sentRehydrates.push(payload);
        }),
        stop: jest.fn(async () => undefined),
        subscribe: jest.fn(() => () => undefined),
        close: jest.fn(async () => undefined),
      },
    });

    const snapshot = await runtime.rehydrate();

    expect(snapshot).toMatchObject({
      replayGenerationId: 'gen-active',
      messages: [{ role: 'assistant', content: 'summary' }],
    });
    expect(sentRehydrates[0]).toMatchObject({
      messages: [{ role: 'assistant', content: 'summary' }],
    });
  });
});
