import {
  type BackendEvent,
  buildCurrentTurnProjection,
  buildDisplayConversation,
  buildRehydrateSnapshot,
  createConversationEvent,
  createInitialConversationRuntimeState,
  InMemoryConversationStore,
  normalizeBackendEventToConversationEvent,
  reduceConversationRuntimeState,
  SdkConversationRuntime,
  toAgentStreamEvent,
  ToolExecutionCoordinator,
  toolOutputStreamKey,
  toolOutputStreamKeys,
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

async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function createMockBackendTransport(
  overrides: Partial<BackendTransport> = {},
): BackendTransport {
  return {
    connect: jest.fn(async () => undefined),
    handshake: jest.fn(async () => undefined),
    sendQuery: jest.fn(async () => 'query-unused'),
    sendToolResult: jest.fn(async () => undefined),
    sendToolBundleResult: jest.fn(async () => undefined),
    rehydrateConversation: jest.fn(async () => undefined),
    compactHistory: jest.fn(async () => 'compact-unused'),
    updateSettings: jest.fn(async () => 'settings-unused'),
    listModels: jest.fn(async () => 'models-unused'),
    stop: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    close: jest.fn(async () => undefined),
    ...overrides,
  };
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

  test('runtime reducer can resolve pending tool waits by provider-safe tool call id', () => {
    const initial = createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1');
    const afterTool = reduceConversationRuntimeState(
      initial,
      event('tool_call', { toolName: 'read_file', toolCallId: 'call-read' }),
    );
    const afterOutput = reduceConversationRuntimeState(
      afterTool,
      event('tool_output', { toolName: 'read_file', toolCallId: 'call-read', success: true }),
    );

    expect(Object.keys(afterTool.pendingTools)).toEqual(['call-read']);
    expect(afterOutput.pendingTools).toEqual({});
    expect(afterOutput.phase).toBe('tool_result_sent');
  });

  test('current-turn projection reduces stream reasoning and tool events once', () => {
    const events = [
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
      event('reasoning_delta', { text: 'Checking the workspace.' }),
      event('tool_call', { toolName: 'read_file', requestId: 'req-read' }),
      event('tool_output', {
        toolName: 'read_file',
        requestId: 'req-read',
        text: 'README contents',
        success: true,
      }),
      event('assistant_delta', { text: 'Done' }),
      event('assistant_delta', { text: '.' }),
      event('turn_completed', {}),
    ];

    expect(buildCurrentTurnProjection(events)).toMatchObject({
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-1',
      phase: 'complete',
      assistantText: 'Done.',
      reasoningText: 'Checking the workspace.',
      lastError: null,
      toolEvents: [
        expect.objectContaining({
          kind: 'tool_call',
          toolName: 'read_file',
        }),
        expect.objectContaining({
          kind: 'tool_output',
          toolName: 'read_file',
          text: 'README contents',
          status: 'success',
        }),
      ],
    });
  });

  test('current-turn projection ignores recoverable display-only backend errors', () => {
    const events = [
      event('turn_started', {}),
      event('assistant_delta', { text: 'Still working' }),
      event('turn_error', { message: 'Failed to update settings: timeout', content: 'Failed to update settings: timeout' }),
      event('turn_error', {
        message: (
          'Unexpected system error: Invalid response from stream: '
          + 'failed to parse streamed tool-call arguments. Raw arguments preview: {"command":"cat"}'
        ),
      }),
    ];

    expect(buildCurrentTurnProjection(events)).toMatchObject({
      phase: 'streaming',
      assistantText: 'Still working',
      lastError: null,
    });
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
        tool_name: 'read_file',
      }),
    ]);
  });

  test('rehydrate projection preserves bundled tool calls and bundle output', () => {
    const events = [
      event('user_message', { text: 'inspect files' }),
      event('tool_bundle_call', {
        bundleId: 'bundle-read',
        tools: [
          {
            name: 'read_file',
            args: { path: 'README.md' },
            metadata: {
              model_facing_tool_call: {
                id: 'call-readme',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"path":"README.md"}',
                },
              },
            },
          },
          {
            name: 'read_file',
            args: { path: 'package.json' },
            metadata: {
              model_facing_tool_call: {
                id: 'call-package',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"path":"package.json"}',
                },
              },
            },
          },
        ],
      }),
      event('tool_bundle_output', {
        bundleId: 'bundle-read',
        structuredPayload: {
          results: [
            { toolCallId: 'call-readme', success: true, output: 'README contents' },
            { toolCallId: 'call-package', success: true, output: 'package contents' },
          ],
        },
      }),
    ];

    const snapshot = buildRehydrateSnapshot(events);

    expect(snapshot.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'inspect files' }),
      expect.objectContaining({
        role: 'assistant',
        tool_calls: [
          expect.objectContaining({ id: 'call-readme' }),
          expect.objectContaining({ id: 'call-package' }),
        ],
        structured_payload: expect.objectContaining({
          bundle_id: 'bundle-read',
          tools: expect.any(Array),
        }),
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-readme',
        tool_name: 'tool_bundle',
        content: 'README contents',
        structured_payload: expect.objectContaining({
          bundle_id: 'bundle-read',
          step_result: expect.objectContaining({ toolCallId: 'call-readme', success: true }),
        }),
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-package',
        tool_name: 'tool_bundle',
        content: 'package contents',
        structured_payload: expect.objectContaining({
          bundle_id: 'bundle-read',
          step_result: expect.objectContaining({ toolCallId: 'call-package', success: true }),
        }),
      }),
    ]);
  });

  test('display and rehydrate projections collapse duplicate local and backend tool outputs', () => {
    const events = [
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
      }),
      createConversationEvent({
        type: 'tool_output',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-1',
        turnRef: 'turn-1',
        source: 'sidecar',
        payload: {
          requestId: 'req-read',
          toolCallId: 'call-read',
          toolName: 'read_file',
          result: {
            display_content: 'full visible output',
            llm_content: 'local model output',
          },
        },
      }),
      createConversationEvent({
        type: 'tool_output',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-1',
        turnRef: 'turn-1',
        source: 'backend',
        payload: {
          display_content: 'full visible output',
          model_llm_content: 'bounded backend model output',
          tool_name: 'read_file',
          request_id: 'req-read',
          tool_call_id: 'call-read',
        },
      }),
    ];

    expect(buildDisplayConversation(events).messages.filter(message => message.messageType === 'tool_output')).toEqual([
      expect.objectContaining({
        text: 'full visible output',
        metadata: expect.objectContaining({
          model_llm_content: 'bounded backend model output',
        }),
      }),
    ]);
    expect(buildRehydrateSnapshot(events).messages.filter(message => message.role === 'tool')).toEqual([
      expect.objectContaining({
        content: 'bounded backend model output',
      }),
    ]);
  });

  test('rehydrate projection excludes partial tool history', () => {
    const events = [
      event('user_message', { text: 'inspect files' }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-complete',
        toolCallId: 'call-complete',
      }),
      event('tool_output', {
        text: 'complete result',
        toolName: 'read_file',
        requestId: 'req-complete',
        toolCallId: 'call-complete',
      }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-dangling-call',
        toolCallId: 'call-dangling',
      }),
      event('tool_output', {
        text: 'orphan output',
        toolName: 'read_file',
        requestId: 'req-dangling-output',
        toolCallId: 'call-orphan',
      }),
      event('tool_bundle_call', {
        bundleId: 'bundle-dangling',
        tools: [],
      }),
    ];

    const snapshot = buildRehydrateSnapshot(events);

    expect(buildDisplayConversation(events).messages).toHaveLength(6);
    expect(snapshot.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'inspect files' }),
      expect.objectContaining({ role: 'assistant', tool_call_id: 'call-complete' }),
      expect.objectContaining({ role: 'tool', content: 'complete result', tool_call_id: 'call-complete' }),
    ]);
  });

  test('rehydrate projection keeps tool pairs when any provider or wait identity matches', () => {
    const events = [
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
      }),
      event('tool_output', {
        text: 'result by provider id only',
        toolName: 'read_file',
        toolCallId: 'call-read',
      }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-second',
      }),
      event('tool_output', {
        text: 'result by wait id only',
        toolName: 'read_file',
        requestId: 'req-second',
      }),
    ];

    expect(buildRehydrateSnapshot(events).messages).toEqual([
      expect.objectContaining({ role: 'assistant', tool_call_id: 'call-read' }),
      expect.objectContaining({ role: 'tool', content: 'result by provider id only', tool_call_id: 'call-read' }),
      expect.objectContaining({ role: 'assistant' }),
      expect.objectContaining({ role: 'tool', content: 'result by wait id only' }),
    ]);
  });

  test('agent stream projection preserves provider ids and dedupes by every tool identity', () => {
    const toolCall = event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-read',
      toolCallId: 'call-read',
      correlationId: 'corr-read',
      args: { path: 'README.md' },
    });
    const streamEvent = toAgentStreamEvent({
      type: 'conversation_event',
      event: toolCall,
    } as any);

    expect(streamEvent).toMatchObject({
      type: 'tool_call',
      event: {
        payload: {
          request_id: 'req-read',
          tool_call_id: 'call-read',
          correlation_id: 'corr-read',
        },
      },
    });

    const toolOutput = event('tool_output', {
      requestId: 'req-read',
      toolCallId: 'call-read',
      correlationId: 'corr-read',
      text: 'result',
    });
    expect(toolOutputStreamKey(toolOutput)).toBe('tool-call:call-read');
    expect(toolOutputStreamKeys(toolOutput)).toEqual([
      'tool-call:call-read',
      'request:req-read',
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
    await expect(store.loadForDisplay('conv-sdk-runtime')).resolves.toMatchObject({
      conversationRef: 'conv-sdk-runtime',
      messages: [
        expect.objectContaining({
          text: 'hello',
          sender: 'user',
        }),
      ],
    });
    await expect(store.loadForRehydrate('conv-sdk-runtime')).resolves.toMatchObject({
      conversationRef: 'conv-sdk-runtime',
      replayGenerationId: 'gen-complete',
      messages: [{ role: 'user', content: 'hello' }],
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

  test('in-memory store preserves append order for out-of-order event timestamps', async () => {
    const store = new InMemoryConversationStore();
    const first = createConversationEvent({
      type: 'tool_call',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      eventId: 'evt-appended-first',
      timestamp: '2026-05-15T12:00:10.000Z',
      payload: { toolName: 'read_file', requestId: 'req-1' },
    });
    const second = createConversationEvent({
      type: 'tool_output',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      eventId: 'evt-appended-second',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { toolName: 'read_file', requestId: 'req-1', text: 'result' },
    });

    await store.appendEvents([first, second]);

    expect((await store.loadEvents('conv-sdk-runtime')).map(storedEvent => storedEvent.eventId)).toEqual([
      'evt-appended-first',
      'evt-appended-second',
    ]);
  });

  test('in-memory store paginates metadata after the cursor conversation', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-oldest',
        revisionId: 'rev-1',
        timestamp: '2026-05-15T10:00:00.000Z',
        payload: { text: 'oldest' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-middle',
        revisionId: 'rev-1',
        timestamp: '2026-05-15T11:00:00.000Z',
        payload: { text: 'middle' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-newest',
        revisionId: 'rev-1',
        timestamp: '2026-05-15T12:00:00.000Z',
        payload: { text: 'newest' },
      }),
    ]);

    expect((await store.listMetadata({ limit: 1 })).map(item => item.conversationRef)).toEqual([
      'conv-newest',
    ]);
    expect((await store.listMetadata({ cursor: 'conv-newest', limit: 2 })).map(item => item.conversationRef)).toEqual([
      'conv-middle',
      'conv-oldest',
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

  test('backend events without conversation_ref are not normalized into conversation events', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'streaming-response',
      turn_ref: 'turn-only',
      payload: { text: 'orphan chunk' },
    });

    expect(normalized).toBeNull();
  });

  test('backend error normalizes to turn_error', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'error',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-error',
      payload: { content: 'backend failed' },
    });

    expect(normalized).toMatchObject({
      type: 'turn_error',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-error',
      payload: expect.objectContaining({
        message: 'backend failed',
        content: 'backend failed',
        userId: 'user-sdk-runtime',
        rawEvent: expect.objectContaining({ type: 'error' }),
      }),
    });
  });

  test('backend token count normalizes to usage_updated', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'token-count',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-usage',
      payload: {
        prompt_tokens: 12,
        visible_output_tokens: 3,
        output_tokens_total: 3,
        total_tokens: 15,
        usage_source: 'provider',
      },
    });

    expect(normalized).toMatchObject({
      type: 'usage_updated',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-usage',
      payload: expect.objectContaining({
        prompt_tokens: 12,
        total_tokens: 15,
        usage_source: 'provider',
        rawEvent: expect.objectContaining({ type: 'token-count' }),
      }),
    });
  });

  test('backend memory store normalizes to memory_stored', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'memory-store',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-memory',
      payload: {
        status: 'stored',
        memory_type: 'episodic',
      },
    });

    expect(normalized).toMatchObject({
      type: 'memory_stored',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-memory',
      payload: expect.objectContaining({
        status: 'stored',
        memory_type: 'episodic',
        rawEvent: expect.objectContaining({ type: 'memory-store' }),
      }),
    });
  });

  test('backend llm thought normalizes to reasoning_delta', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'llm-thought',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-reasoning',
      payload: { status: 'thinking through it' },
    });

    expect(normalized).toMatchObject({
      type: 'reasoning_delta',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-reasoning',
      payload: expect.objectContaining({
        text: 'thinking through it',
        rawEvent: expect.objectContaining({ type: 'llm-thought' }),
      }),
    });
  });

  test('backend llm thought content fallback normalizes to reasoning_delta', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'llm-thought',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-reasoning',
      payload: { content: 'reasoning fallback' },
    });

    expect(normalized).toMatchObject({
      type: 'reasoning_delta',
      payload: expect.objectContaining({
        text: 'reasoning fallback',
      }),
    });
  });

  test('reasoning deltas stay out of display and rehydrate projections', () => {
    const reasoning = event('reasoning_delta', { text: 'private reasoning stream' });

    expect(buildDisplayConversation([reasoning]).messages).toEqual([]);
    expect(buildRehydrateSnapshot([reasoning]).messages).toEqual([]);
  });

  test('backend web search progress normalizes to tool_progress', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'web-search-progress',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-search',
      payload: {
        text: 'Searched example.com',
        request_id: 'req-search-1',
        query: 'example',
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_progress',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-search',
      payload: expect.objectContaining({
        toolName: 'web_search',
        text: 'Searched example.com',
        requestId: 'req-search-1',
        correlationId: 'req-search-1',
        structuredPayload: expect.objectContaining({ query: 'example' }),
        rawEvent: expect.objectContaining({ type: 'web-search-progress' }),
      }),
    });
  });

  test('tool progress stays out of display and rehydrate projections', () => {
    const progress = event('tool_progress', { text: 'Searched example.com', toolName: 'web_search' });

    expect(buildDisplayConversation([progress]).messages).toEqual([]);
    expect(buildRehydrateSnapshot([progress]).messages).toEqual([]);
  });

  test('backend query-accepted normalizes to turn_started', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'query-accepted',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-accepted',
      payload: { status: 'accepted' },
    });

    expect(normalized).toMatchObject({
      type: 'turn_started',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-accepted',
      source: 'backend',
      payload: expect.objectContaining({
        status: 'accepted',
      }),
    });
  });

  test('backend metadata events normalize without producing display messages', () => {
    const systemPrompt = normalizeBackendEventToConversationEvent({
      type: 'system-prompt',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: { content: 'system prompt' },
    });
    const userMetadata = normalizeBackendEventToConversationEvent({
      type: 'user-message-full',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: { content: 'full user payload' },
    });
    const toolSchemas = normalizeBackendEventToConversationEvent({
      type: 'tool-schemas',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: { tool_schemas: [{ type: 'function', name: 'read_file' }] },
    });

    expect(systemPrompt).toMatchObject({
      type: 'system_prompt',
      payload: expect.objectContaining({
        content: 'system prompt',
        toolSchemas: [],
        structuredPayload: expect.objectContaining({ content: 'system prompt' }),
      }),
    });
    expect(userMetadata).toMatchObject({
      type: 'user_message_metadata',
      payload: expect.objectContaining({
        content: 'full user payload',
        structuredPayload: expect.objectContaining({ content: 'full user payload' }),
      }),
    });
    expect(toolSchemas).toMatchObject({
      type: 'tool_schemas_metadata',
      payload: expect.objectContaining({
        toolSchemas: [expect.objectContaining({ name: 'read_file' })],
        structuredPayload: expect.objectContaining({
          tool_schemas: [expect.objectContaining({ name: 'read_file' })],
        }),
      }),
    });
    expect(buildDisplayConversation([
      systemPrompt as ConversationEvent,
      userMetadata as ConversationEvent,
      toolSchemas as ConversationEvent,
    ]).messages).toEqual([]);
  });

  test('backend assistant-message-full normalizes to assistant storage truth', () => {
    const assistant = normalizeBackendEventToConversationEvent({
      type: 'assistant-message-full',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: { content: 'final assistant answer' },
    });
    const complete = normalizeBackendEventToConversationEvent({
      type: 'streaming-complete',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-1',
      payload: { final_response: 'final assistant answer' },
    });

    expect(assistant).toMatchObject({
      type: 'assistant_message',
      payload: expect.objectContaining({
        text: 'final assistant answer',
      }),
    });
    expect(complete).toMatchObject({
      type: 'turn_completed',
      payload: expect.objectContaining({
        finalResponse: 'final assistant answer',
        userId: 'user-sdk-runtime',
      }),
    });
    expect(buildDisplayConversation([
      assistant as ConversationEvent,
      complete as ConversationEvent,
    ]).messages).toEqual([
      expect.objectContaining({
        sender: 'assistant',
        messageType: 'assistant_message',
        text: 'final assistant answer',
      }),
    ]);
    expect(buildRehydrateSnapshot([
      assistant as ConversationEvent,
      complete as ConversationEvent,
    ]).messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'final assistant answer',
      }),
    ]);
  });

  test('backend local-user-message normalization exposes renderer user-message fields', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'local-user-message',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-local-user',
      payload: {
        text: 'hello from chatbox',
        screenshot_ref: 'artifact-local',
        screenshot_url: '/api/artifacts/artifact-local',
        screenshot_refs: ['artifact-local', 'artifact-local-2'],
        attachment_filenames: ['a.png'],
      },
    });

    expect(normalized).toMatchObject({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-local-user',
      payload: expect.objectContaining({
        text: 'hello from chatbox',
        content: 'hello from chatbox',
        screenshotRef: 'artifact-local',
        screenshotUrl: '/api/artifacts/artifact-local',
        screenshotRefs: ['artifact-local', 'artifact-local-2'],
        attachmentFilenames: ['a.png'],
        userId: 'user-sdk-runtime',
        sourceEventType: 'local-user-message',
      }),
    });
  });

  test('backend tool-call normalization preserves model-facing tool call ids', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-1',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: 'README.md' },
        metadata: {
          model_facing_tool_call: {
            id: 'call-read',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"README.md"}',
            },
          },
        },
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_call',
      payload: expect.objectContaining({
        requestId: 'req-read',
        toolCallId: 'call-read',
        userId: 'user-sdk-runtime',
      }),
    });
  });

  test('backend tool-output normalization exposes renderer identity and attachment fields', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-output',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-output',
      payload: {
        tool_name: 'mouse_control',
        request_id: 'req-output',
        output: 'clicked',
        screenshot: 'inline-shot',
        screenshot_ref: 'artifact-shot',
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_output',
      payload: expect.objectContaining({
        toolName: 'mouse_control',
        requestId: 'req-output',
        correlationId: 'req-output',
        screenshot: 'inline-shot',
        screenshotRef: 'artifact-shot',
        userId: 'user-sdk-runtime',
      }),
    });
  });

  test('backend tool-bundle normalization exposes renderer identity fields', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-bundle',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-bundle',
      payload: {
        bundle_id: 'bundle-sdk-runtime',
        tools: [
          {
            name: 'read_file',
            args: { file_path: '/tmp/a' },
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_bundle_call',
      payload: expect.objectContaining({
        bundleId: 'bundle-sdk-runtime',
        correlationId: 'bundle-sdk-runtime',
        userId: 'user-sdk-runtime',
        tools: [
          expect.objectContaining({
            name: 'read_file',
          }),
        ],
      }),
    });
  });

  test('backend compaction-completed only normalizes to applied when replacement history exists', () => {
    const applied = normalizeBackendEventToConversationEvent({
      type: 'context-compaction-completed',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: {
        generation_id: 'gen-applied',
        summary_preview: 'summary',
        replacement_history_entries: [
          { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
        ],
        skipped_reason: null,
      },
    });
    const missingReplacement = normalizeBackendEventToConversationEvent({
      type: 'context-compaction-completed',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: {
        summary_preview: 'summary but no replacement history',
        replacement_history_entries: [],
        skipped_reason: null,
      },
    });

    expect(applied).toMatchObject({
      type: 'compaction_applied',
      payload: expect.objectContaining({
        generationId: 'gen-applied',
        summaryPreview: 'summary',
        replacementHistoryEntries: [
          expect.objectContaining({ message_type: 'context_compaction' }),
        ],
        skippedReason: null,
      }),
    });
    expect(missingReplacement).toMatchObject({
      type: 'compaction_skipped',
      payload: expect.objectContaining({
        skippedReason: 'missing-replacement-history',
      }),
    });
    expect(buildDisplayConversation([missingReplacement as ConversationEvent]).messages).toEqual([]);
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
          toolCallId: null,
          correlationId: null,
          success: false,
          error: 'sidecar unavailable',
        }),
      }),
    ]);
  });

  test('tool coordinator preserves provider-safe ids on local tool outputs', async () => {
    const store = new InMemoryConversationStore();
    const executeTool = jest.fn(async () => ({
      success: true,
      data: { output: 'README contents' },
    }));
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: { executeTool },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-read',
      toolCallId: 'call-read',
      correlationId: 'corr-read',
      args: { path: 'README.md' },
    }));

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req-read',
      toolCallId: 'call-read',
      correlationId: 'corr-read',
    }));
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-read',
          toolCallId: 'call-read',
          correlationId: 'corr-read',
          success: true,
        }),
      }),
    ]);
  });

  test('tool coordinator resolves provider-safe id from model-facing metadata', async () => {
    const executeTool = jest.fn(async () => ({
      success: true,
      data: { output: 'README contents' },
    }));
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: { executeTool },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-read',
      metadata: {
        model_facing_tool_call: {
          id: 'call-read-model',
          name: 'read_file',
          arguments: '{"path":"README.md"}',
        },
      },
      args: { path: 'README.md' },
    }));

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req-read',
      toolCallId: 'call-read-model',
    }));
  });

  test('tool coordinator marks claimed tool results failed when backend delivery fails', async () => {
    const store = new InMemoryConversationStore();
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: { return_display: 'local output' },
        })),
      },
      sendToolResult: jest.fn(async () => {
        throw new Error('websocket closed');
      }),
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await expect(coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-delivery',
      args: { path: 'README.md' },
    }))).rejects.toThrow('websocket closed');

    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-delivery',
          success: false,
          deliveryFailed: true,
          error: 'Tool result delivery failed: websocket closed',
        }),
      }),
    ]);
  });

  test('tool coordinator sends backend-compatible bundle step statuses', async () => {
    const sendToolBundleResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: {
        executeTool: jest
          .fn()
          .mockResolvedValueOnce({ success: true, data: { output: 'one' } })
          .mockResolvedValueOnce({ success: false, error: 'failed-two' }),
      },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult,
    });

    const claim = await coordinator.execute(event('tool_bundle_call', {
      bundleId: 'bundle-read',
      tools: [
        { name: 'read_file', args: { path: 'a' } },
        { name: 'read_file', args: { path: 'b' } },
      ],
    }));

    expect(claim.claimed).toBe(true);
    const bundlePayload = sendToolBundleResult.mock.calls[0][0];
    expect(bundlePayload.bundle_id).toBe('bundle-read');
    expect(bundlePayload.status).toBe('partial_failure');
    expect(bundlePayload.step_results[0].status).toBe('ok');
    expect(bundlePayload.step_results[0].output.llm_content).toBe('one');
    expect(bundlePayload.step_results[1]).toEqual({
      tool: 'read_file',
      status: 'error',
      output: { error: 'failed-two' },
    });
  });

  test('conversation runtime stores events and sends rehydrate from projection', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const sentRehydrates: Record<string, unknown>[] = [];
    const transport = createMockBackendTransport({
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-1';
      }),
      rehydrateConversation: jest.fn(async payload => {
        sentRehydrates.push(payload);
      }),
    });
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
      rehydrate_mode: 'replace',
      messages: [
        expect.objectContaining({ role: 'user', content: 'hello' }),
      ],
    });
  });

  test('conversation runtime sends compact-history through backend transport', async () => {
    const compactHistory = jest.fn(async () => 'compact-1');
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockBackendTransport({
        compactHistory,
      }),
    });

    await expect(runtime.compactHistory({ force: false })).resolves.toBe('compact-1');

    expect(compactHistory).toHaveBeenCalledWith({
      force: false,
      conversation_ref: 'conv-sdk-runtime',
    });
  });

  test('conversation runtime updates model selection before sending a turn', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const settingsUpdates: Record<string, unknown>[] = [];
    const transport = createMockBackendTransport({
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-model';
      }),
      updateSettings: jest.fn(async payload => {
        settingsUpdates.push(payload);
        return 'settings-model';
      }),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });

    await runtime.send({
      text: 'use the selected model',
      turnRef: 'turn-model',
      model: {
        modelProvider: 'openai',
        modelId: 'gpt-5.4@@gpt-5-4-high-thinking',
        modelMode: 'high',
        interactionMode: 'agent',
      },
    });

    expect(settingsUpdates).toEqual([
      {
        selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
        model_provider: 'openai',
        model_mode: 'high',
        interaction_mode: 'agent',
      },
    ]);
    expect(sentQueries[0]).toMatchObject({
      text: 'use the selected model',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-model',
    });
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(event => event.type)).toEqual([
      'settings_updated',
      'turn_started',
      'user_message',
    ]);
    expect(events[0].payload).toMatchObject({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
      model_mode: 'high',
      interaction_mode: 'agent',
      backendMessageId: 'settings-model',
    });
    const snapshot = await runtime.load();
    expect(snapshot.state.settings).toMatchObject({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
    expect(snapshot.display.messages.map(message => message.messageType)).toEqual(['user_message']);
    expect(snapshot.rehydrate.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'use the selected model',
      }),
    ]);
  });

  test('conversation runtime validates model selections before sending a turn', async () => {
    const sendQuery = jest.fn(async () => 'query-unused');
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockBackendTransport({
        sendQuery,
      }),
    });

    await expect(runtime.send({
      text: 'bad model',
      model: {
        modelProvider: 'openai',
        modelId: '',
      },
    })).rejects.toThrow('ConversationRuntime.setModel requires a non-empty modelId');
    expect(sendQuery).not.toHaveBeenCalled();
  });

  test('conversation runtime stream yields normalized events until backend completion', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    let backendListener: ((event: unknown) => void) | null = null;
    const transport = createMockBackendTransport({
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-stream';
      }),
      subscribe: jest.fn(listener => {
        backendListener = listener;
        return () => {
          backendListener = null;
        };
      }),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
    });
    runtime.attachTransport();

    const collected: string[] = [];
    const consume = (async () => {
      for await (const runtimeEvent of runtime.stream({ text: 'stream this', turnRef: 'turn-stream' })) {
        collected.push(runtimeEvent.type === 'conversation_event'
          ? runtimeEvent.event.type
          : runtimeEvent.type);
      }
    })();

    await tick();
    expect(sentQueries[0]).toMatchObject({
      text: 'stream this',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
    });
    expect(backendListener).toBeTruthy();
    backendListener?.({
      type: 'streaming-response',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { text: 'partial' },
    } satisfies BackendEvent);
    backendListener?.({
      type: 'assistant-message-full',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { content: 'done' },
    } satisfies BackendEvent);
    backendListener?.({
      type: 'streaming-complete',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { final_response: 'done' },
    } satisfies BackendEvent);

    await consume;

    expect(collected).toContain('turn_started');
    expect(collected).toContain('user_message');
    expect(collected).toContain('assistant_delta');
    expect(collected).toContain('assistant_message');
    expect(collected).toContain('turn_completed');
    const snapshot = await runtime.load();
    expect(snapshot.state.phase).toBe('completed');
    expect(snapshot.display.messages.map(message => message.messageType)).toEqual([
      'user_message',
      'assistant_message',
    ]);
  });

  test('conversation runtimes only accept backend events for their conversation and active turn', async () => {
    const backendListeners = new Set<(event: unknown) => void>();
    const transport = createMockBackendTransport({
      subscribe: jest.fn(listener => {
        backendListeners.add(listener);
        return () => {
          backendListeners.delete(listener);
        };
      }),
    });
    const store = new InMemoryConversationStore();
    const first = new SdkConversationRuntime({
      conversationRef: 'conv-first',
      store,
      transport,
    });
    const second = new SdkConversationRuntime({
      conversationRef: 'conv-second',
      store,
      transport,
    });
    first.attachTransport();
    second.attachTransport();

    await first.send({ text: 'first', turnRef: 'turn-first' });
    await second.send({ text: 'second', turnRef: 'turn-second' });
    backendListeners.forEach(listener => listener({
      type: 'streaming-response',
      conversation_ref: 'conv-first',
      turn_ref: 'turn-first',
      payload: { text: 'first chunk' },
    } satisfies BackendEvent));
    backendListeners.forEach(listener => listener({
      type: 'streaming-response',
      conversation_ref: 'conv-first',
      turn_ref: 'turn-old',
      payload: { text: 'stale chunk' },
    } satisfies BackendEvent));
    backendListeners.forEach(listener => listener({
      type: 'streaming-response',
      payload: { text: 'ambiguous chunk' },
    } satisfies BackendEvent));
    await tick();

    expect((await store.loadEvents('conv-first')).filter(storedEvent => storedEvent.type === 'assistant_delta')).toHaveLength(1);
    expect((await store.loadEvents('conv-second')).filter(storedEvent => storedEvent.type === 'assistant_delta')).toHaveLength(0);
  });

  test('conversation runtime can route backend tool calls through a local runtime coordinator', async () => {
    const sentToolResults: Record<string, unknown>[] = [];
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      localRuntime: {
        executeTool: jest.fn(async call => ({
          success: true,
          data: {
            return_display: `read ${String(call.args.path)}`,
          },
        })),
      },
      transport: createMockBackendTransport({
        sendToolResult: jest.fn(async payload => {
          sentToolResults.push(payload);
        }),
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    backendListener?.({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: 'README.md' },
      },
    } satisfies BackendEvent);
    await tick();

    expect(sentToolResults[0]).toMatchObject({
      request_id: 'req-read',
      success: true,
      data: {
        llm_content: 'read README.md',
      },
    });
    expect((await store.loadEvents('conv-sdk-runtime')).map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'tool_output',
    ]);
    expect((await runtime.load()).state.phase).toBe('tool_result_sent');
  });

  test('conversation runtime marks the turn failed when local tool result delivery fails', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            return_display: 'read README.md',
          },
        })),
      },
      transport: createMockBackendTransport({
        sendToolResult: jest.fn(async () => {
          throw new Error('websocket closed');
        }),
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    backendListener?.({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: 'README.md' },
      },
    } satisfies BackendEvent);
    await tick();
    await tick();

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'tool_output',
      'turn_error',
    ]);
    expect(events[1].payload).toMatchObject({
      requestId: 'req-read',
      success: false,
      deliveryFailed: true,
      error: 'Tool result delivery failed: websocket closed',
    });
    expect(events[2].payload).toMatchObject({
      reason: 'tool_result_delivery_failed',
      error: 'websocket closed',
    });
    expect((await runtime.load()).state.phase).toBe('error');
  });

  test('conversation runtime records malformed tool events as explicit runtime errors', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const executeTool = jest.fn(async () => ({
      success: true,
      data: {
        return_display: 'should not run',
      },
    }));
    const sendToolResult = jest.fn(async () => undefined);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      localRuntime: {
        executeTool,
      },
      transport: createMockBackendTransport({
        sendToolResult,
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    backendListener?.({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        parameters: { path: 'README.md' },
      },
    } satisfies BackendEvent);
    await tick();
    await tick();

    expect(executeTool).not.toHaveBeenCalled();
    expect(sendToolResult).not.toHaveBeenCalled();
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'runtime_error',
    ]);
    expect(events[1].payload).toMatchObject({
      reason: 'malformed_tool_event',
      claimReason: 'missing-tool-name-or-request-id',
    });
    expect((await runtime.load()).state.phase).toBe('error');
  });

  test('editAndResend rewrites from the edited user message and sends a new revision turn', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const transport = createMockBackendTransport({
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return 'query-edited';
      }),
    });
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
      transport: createMockBackendTransport({
        sendQuery: jest.fn(async payload => {
          sentQueries.push(payload);
          return 'query-retry';
        }),
      }),
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
      transport: createMockBackendTransport({
        rehydrateConversation: jest.fn(async payload => {
          sentRehydrates.push(payload);
        }),
      }),
    });

    const snapshot = await runtime.rehydrate();

    expect(snapshot).toMatchObject({
      replayGenerationId: 'gen-active',
      messages: [{ role: 'assistant', content: 'summary' }],
    });
    expect(sentRehydrates[0]).toMatchObject({
      conversation_ref: 'conv-sdk-runtime',
      rehydrate_mode: 'replace',
      messages: [{ role: 'assistant', content: 'summary' }],
    });
  });
});
