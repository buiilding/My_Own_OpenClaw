import {
  type BackendEvent,
  buildCurrentTurnProjection,
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
  createConversationEvent,
  createInitialConversationRuntimeState,
  InMemoryConversationStore,
  normalizeBackendEventToConversationEvent as normalizeBackendEventToConversationEventRaw,
  reduceConversationRuntimeState,
  SdkConversationRuntime,
  toAgentStreamEvents,
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

async function waitForExpect(assertion: () => void | Promise<void>, attempts = 25): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await tick();
    }
  }
  throw lastError;
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

const INLINE_JPEG_BASE64 = 'aW5saW5lLXNob3QtYjY0';

function createMockArtifactUploader(
  overrides: Partial<{
    upload: jest.Mock;
    url: jest.Mock;
  }> = {},
) {
  return {
    upload: overrides.upload ?? jest.fn(async () => ({
      artifact_id: 'artifact-shot.jpg',
      content_type: 'image/jpeg',
      size_bytes: 15,
      sha256: 'sha-shot',
      url: '/api/artifacts/artifact-shot.jpg',
    })),
    url: overrides.url ?? jest.fn((artifactId: string) => `/api/artifacts/${artifactId}`),
  };
}

function createControllableBackendTransport(
  overrides: Partial<BackendTransport> = {},
): BackendTransport & { emit(event: BackendEvent): void } {
  const listeners = new Set<(event: unknown) => void>();
  const transport = createMockBackendTransport({
    ...overrides,
    subscribe: jest.fn((listener: (event: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  }) as BackendTransport & { emit(event: BackendEvent): void };
  transport.emit = (event: BackendEvent) => {
    listeners.forEach(listener => listener(stampBackendEvent(event)));
  };
  return transport;
}

function backendEvent(
  type: BackendEvent['type'],
  payload: Record<string, unknown>,
  options: { eventId: string; turnRef: string; sequence?: number },
): BackendEvent {
  return {
    id: options.turnRef,
    event_id: options.eventId,
    ...(typeof options.sequence === 'number' ? { sequence: options.sequence } : {}),
    type,
    conversation_ref: 'conv-sdk-runtime',
    turn_ref: options.turnRef,
    user_id: 'user-sdk-runtime',
    payload,
  } as BackendEvent;
}

const testBackendEventSequences = new Map<string, number>();

function stampBackendEvent(event: BackendEvent): BackendEvent {
  const turnRef = typeof event.turn_ref === 'string' && event.turn_ref.trim()
    ? event.turn_ref.trim()
    : 'turn-test';
  const sequence = typeof event.sequence === 'number'
    ? event.sequence
    : ((testBackendEventSequences.get(turnRef) ?? 0) + 1);
  testBackendEventSequences.set(turnRef, sequence);
  return {
    ...event,
    id: typeof event.id === 'string' ? event.id : turnRef,
    event_id: typeof event.event_id === 'string'
      ? event.event_id
      : `${turnRef}-evt-${sequence.toString().padStart(6, '0')}-${event.type}`,
    sequence,
  } as BackendEvent;
}

function normalizeBackendEventToConversationEvent(
  event: BackendEvent,
  options?: Parameters<typeof normalizeBackendEventToConversationEventRaw>[1],
): ConversationEvent | null {
  return normalizeBackendEventToConversationEventRaw(stampBackendEvent(event), options);
}

describe('Windie SDK conversation runtime core', () => {
  beforeEach(() => {
    testBackendEventSequences.clear();
  });

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

  test('SDK display rows preserve append order for tool call and output rows', () => {
    const events = [
      event('user_message', { text: 'inspect files' }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-readme',
        toolCallId: 'call-readme',
        args: { path: 'README.md' },
      }),
      event('tool_output', {
        toolName: 'read_file',
        requestId: 'req-readme',
        toolCallId: 'call-readme',
        result: { output: 'README contents' },
        success: true,
      }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-package',
        toolCallId: 'call-package',
        args: { path: 'package.json' },
      }),
      event('tool_output', {
        toolName: 'read_file',
        requestId: 'req-package',
        toolCallId: 'call-package',
        result: { output: 'package contents' },
        success: true,
      }),
      event('assistant_message', { text: 'Both files were inspected.' }),
    ];

    const rows = buildDisplayRows(events);

    expect(rows.map(row => row.type)).toEqual([
      'user_message',
      'tool_call',
      'tool_output',
      'tool_call',
      'tool_output',
      'assistant_message',
    ]);
    expect(rows.map(row => row.index)).toEqual([0, 1, 2, 3, 4, 5]);
	    expect(rows[1]).toMatchObject({
	      role: 'assistant',
	      type: 'tool_call',
	      content: {
	        id: 'call-readme',
	        name: 'read_file',
	        arguments: { path: 'README.md' },
	      },
	      metadata: {
	        toolName: 'read_file',
	        requestId: 'req-readme',
        toolCallId: 'call-readme',
      },
    });
	    expect(rows[2]).toMatchObject({
	      role: 'tool',
	      type: 'tool_output',
	      content: 'README contents',
      metadata: {
        toolName: 'read_file',
        requestId: 'req-readme',
        toolCallId: 'call-readme',
      },
		    });
		  });

  test('SDK display rows keep distinct tool-call rows when transport event ids collide', () => {
    const firstToolCall = createConversationEvent({
      type: 'tool_call',
      eventId: 'shared-tool-event',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        toolName: 'read_file',
        requestId: 'req-readme',
        toolCallId: 'call-readme',
        args: { path: 'README.md' },
      },
    });
    const secondToolCall = createConversationEvent({
      type: 'tool_call',
      eventId: 'shared-tool-event',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        toolName: 'read_file',
        requestId: 'req-package',
        toolCallId: 'call-package',
        args: { path: 'package.json' },
      },
    });

    const rows = buildDisplayRows([firstToolCall, secondToolCall]);

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.id)).toEqual([
      'shared-tool-event:tool_call:call-readme',
      'shared-tool-event:tool_call:call-package',
    ]);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
  });

  test('SDK display rows use output as tool text', () => {
    const rows = buildDisplayRows([
      event('tool_output', {
        toolName: 'run_shell_command',
        requestId: 'req-shell',
        result: {
          output: 'raw tool output',
        },
        success: true,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'tool_output',
      content: 'raw tool output',
    });
  });

  test('orphan empty-chat greeting is not display or rehydrate history', () => {
    const events = [
      event('conversation_rewritten', { reason: 'retry' }),
      event('assistant_message', { text: 'Hi! What can I help you with?' }),
    ];

    expect(buildDisplayConversation(events).messages).toEqual([]);
    expect(buildRehydrateSnapshot(events).messages).toEqual([]);
  });

  test('assistant greeting remains display history after a user turn exists', () => {
    const events = [
      event('user_message', { text: 'hello' }),
      event('assistant_message', { text: 'Hi! What can I help you with?' }),
    ];

    expect(buildDisplayConversation(events).messages.map(message => message.text)).toEqual([
      'hello',
      'Hi! What can I help you with?',
    ]);
    expect(buildRehydrateSnapshot(events).messages.map(message => message.content)).toEqual([
      'hello',
      'Hi! What can I help you with?',
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

  test('current-turn projection renders tool-bundle-output step content', () => {
    const events = [
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
      event('tool_bundle_output', {
        bundleId: 'bundle-read',
        status: 'success',
        stepResults: [
          {
            tool: 'read_file',
            toolCallId: 'call-readme',
            status: 'ok',
            output: {
              output: 'README contents',
              output: 'README model contents',
            },
          },
          {
            tool: 'read_file',
            toolCallId: 'call-package',
            status: 'ok',
            output: {
              content: 'package contents',
            },
          },
        ],
      }),
    ];

    const projection = buildCurrentTurnProjection(events);

	    expect(projection.toolEvents).toEqual([
	      expect.objectContaining({
	        kind: 'tool_output',
	        toolName: 'tool_bundle',
	        text: expect.stringContaining('README model contents'),
	        status: 'success',
	      }),
	    ]);
    expect(projection.toolEvents[0].text).toContain('package contents');
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
	    const rows = buildDisplayRows(events);

	    expect(rows[1]).toMatchObject({
	      type: 'tool_bundle_call',
	      content: {
	        bundleId: 'bundle-read',
	        tool_calls: [
	          expect.objectContaining({ id: 'call-readme' }),
	          expect.objectContaining({ id: 'call-package' }),
	        ],
	      },
	    });
	    expect(rows[2]).toMatchObject({
	      type: 'tool_bundle_output',
	      content: {
	        bundleId: 'bundle-read',
	        step_results: [
	          expect.objectContaining({ toolCallId: 'call-readme', output: 'README contents' }),
	          expect.objectContaining({ toolCallId: 'call-package', output: 'package contents' }),
	        ],
	      },
	    });

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
            output: 'local tool output',
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
          output: 'backend tool output',
          tool_name: 'read_file',
          request_id: 'req-read',
          tool_call_id: 'call-read',
        },
      }),
    ];

    expect(buildDisplayConversation(events).messages.filter(message => message.messageType === 'tool_output')).toEqual([
      expect.objectContaining({
        text: 'backend tool output',
      }),
    ]);
    expect(buildRehydrateSnapshot(events).messages.filter(message => message.role === 'tool')).toEqual([
      expect.objectContaining({
        content: 'backend tool output',
      }),
    ]);
  });

  test('deduplicated tool outputs prefer backend output over local source', () => {
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
        source: 'backend',
        payload: {
          output: 'backend display only',
          tool_name: 'read_file',
          request_id: 'req-read',
          tool_call_id: 'call-read',
        },
      }),
      event('tool_output', {
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
        result: {
          output: 'local model-visible output',
        },
      }),
    ];

    expect(buildDisplayConversation(events).messages.filter(message => message.messageType === 'tool_output')).toEqual([
      expect.objectContaining({
        text: 'backend display only',
      }),
    ]);
    expect(buildRehydrateSnapshot(events).messages.filter(message => message.role === 'tool')).toEqual([
      expect.objectContaining({
        content: 'backend display only',
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
    const streamEvents = toAgentStreamEvents({
      type: 'conversation_event',
      event: toolCall,
    } as any);
    const streamEvent = streamEvents.find(event => event.type === 'tool_calls');

    expect(streamEvent).toMatchObject({
      type: 'tool_calls',
      calls: [
        expect.objectContaining({
          requestId: 'req-read',
          toolCallId: 'call-read',
        }),
      ],
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

  test('agent stream projection exposes injected user message content', () => {
    const streamEvents = toAgentStreamEvents({
      type: 'conversation_event',
      event: event('user_message', {
        text: 'what do you remember?',
        content: '<episodic_memory>\n- remembered preference\n</episodic_memory>\n\n<user_query>\nwhat do you remember?\n</user_query>',
      }),
    } as any);

    expect(streamEvents).toEqual([
      expect.objectContaining({
        type: 'state',
        state: 'sending',
      }),
      expect.objectContaining({
        type: 'user_message',
        text: 'what do you remember?',
        content: '<episodic_memory>\n- remembered preference\n</episodic_memory>\n\n<user_query>\nwhat do you remember?\n</user_query>',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
      }),
      expect.objectContaining({
        type: 'state',
        state: 'thinking',
      }),
    ]);
  });

  test('agent stream projection exposes memory retrieval diagnostics without error state', () => {
    const streamEvents = toAgentStreamEvents({
      type: 'conversation_event',
      event: event('memory_retrieval_diagnostic', {
        stage: 'search_empty',
        message: 'Memory retrieval completed with no matching memories.',
        episodicCount: 0,
        semanticCount: 0,
      }),
    } as any);

    expect(streamEvents).toEqual([
      expect.objectContaining({
        type: 'memory_diagnostic',
        stage: 'search_empty',
        message: 'Memory retrieval completed with no matching memories.',
        episodicCount: 0,
        semanticCount: 0,
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
      }),
    ]);
    expect(streamEvents).not.toContainEqual(expect.objectContaining({ type: 'state', state: 'error' }));
  });

  test('agent stream projection exposes memory persistence diagnostics without error state', () => {
    const streamEvents = toAgentStreamEvents({
      type: 'conversation_event',
      event: event('memory_persistence_diagnostic', {
        stage: 'store_succeeded',
        message: 'Completed-turn memory storage succeeded.',
        contentLength: 42,
        memoryType: 'episodic',
        memoryId: 'mem-1',
      }),
    } as any);

    expect(streamEvents).toEqual([
      expect.objectContaining({
        type: 'memory_diagnostic',
        stage: 'store_succeeded',
        message: 'Completed-turn memory storage succeeded.',
        contentLength: 42,
        memoryType: 'episodic',
        memoryId: 'mem-1',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
      }),
    ]);
    expect(streamEvents).not.toContainEqual(expect.objectContaining({ type: 'state', state: 'error' }));
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
    await expect(store.loadDisplayRows('conv-sdk-runtime')).resolves.toEqual([
      expect.objectContaining({
        type: 'user_message',
        role: 'user',
        content: 'hello',
      }),
    ]);
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
        correlation_id: 'corr-search-1',
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
        correlationId: 'corr-search-1',
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
    const normalized = normalizeBackendEventToConversationEvent(backendEvent(
      'query-accepted',
      { status: 'accepted' },
      {
        eventId: 'turn-accepted-evt-000001-query-accepted',
        turnRef: 'turn-accepted',
        sequence: 1,
      },
    ));

    expect(normalized).toMatchObject({
      eventId: 'turn-accepted-evt-000001-query-accepted',
      type: 'turn_started',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-accepted',
      source: 'backend',
      payload: expect.objectContaining({
        status: 'accepted',
        backendSequence: 1,
      }),
    });
  });

  test('backend event without stream identity normalizes to runtime_error', () => {
    const normalized = normalizeBackendEventToConversationEventRaw({
      id: 'turn-missing',
      type: 'streaming-response',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-missing',
      payload: { text: 'orphan chunk' },
    } satisfies BackendEvent);

    expect(normalized).toMatchObject({
      type: 'runtime_error',
      source: 'sdk',
      conversationRef: 'conv-sdk-runtime',
      payload: expect.objectContaining({
        reason: 'missing_backend_event_identity',
        sourceEventType: 'streaming-response',
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
        metadata: expect.objectContaining({
          model_facing_tool_call: expect.any(Object),
        }),
        toolCallId: 'call-read',
        userId: 'user-sdk-runtime',
      }),
    });
  });

  test('backend tool-call normalization preserves skip execution metadata', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-1',
      payload: {
        tool_name: 'browser',
        request_id: 'req-invalid-browser',
        parameters: { action: 'click', text: 'Sign in' },
        metadata: { skip_frontend_execution: true },
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_call',
      payload: expect.objectContaining({
        toolName: 'browser',
        requestId: 'req-invalid-browser',
        metadata: { skip_frontend_execution: true },
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
        correlation_id: 'corr-output',
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
        correlationId: 'corr-output',
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
      data: {
        output: 'sidecar unavailable',
      },
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

  test('tool coordinator skips backend-marked synthetic validation calls', async () => {
    const store = new InMemoryConversationStore();
    const executeTool = jest.fn(async () => ({ success: true, data: { output: 'ran' } }));
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: { executeTool },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    const claim = await coordinator.execute(event('tool_call', {
      toolName: 'browser',
      requestId: 'req-invalid-browser',
      args: { action: 'click', text: 'Sign in' },
      metadata: { skip_frontend_execution: true },
    }));

    expect(claim).toEqual({ claimed: true, reason: 'skip_frontend_execution' });
    expect(executeTool).not.toHaveBeenCalled();
    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([]);
  });

  test('tool coordinator wraps single local execution with lifecycle release on success and failure', async () => {
    const successfulOrder: string[] = [];
    const sendToolResult = jest.fn(async () => undefined);
    const executeTool = jest.fn(async () => {
      successfulOrder.push('execute');
      return { success: true, data: { output: 'done' } };
    });
    const beforeExecute = jest.fn(async (call) => {
      successfulOrder.push(`before:${call.toolName}`);
      return async () => {
        successfulOrder.push(`release:${call.toolName}`);
      };
    });
    const coordinator = new ToolExecutionCoordinator({
      localToolLifecycle: { beforeExecute },
      localRuntime: { executeTool },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-lifecycle',
      args: { path: 'README.md' },
    }));

    expect(successfulOrder).toEqual([
      'before:read_file',
      'execute',
      'release:read_file',
    ]);
    expect(beforeExecute).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'read_file',
      requestId: 'req-lifecycle',
    }));
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-lifecycle',
      success: true,
    }));

    const failedOrder: string[] = [];
    const failedCoordinator = new ToolExecutionCoordinator({
      localToolLifecycle: {
        beforeExecute: jest.fn(async (call) => {
          failedOrder.push(`before:${call.toolName}`);
          return () => {
            failedOrder.push(`release:${call.toolName}`);
          };
        }),
      },
      localRuntime: {
        executeTool: jest.fn(async () => {
          failedOrder.push('execute');
          throw new Error('sidecar failed');
        }),
      },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await failedCoordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-lifecycle-failed',
      args: { path: 'README.md' },
    }));

    expect(failedOrder).toEqual([
      'before:read_file',
      'execute',
      'release:read_file',
    ]);
  });

  test('tool coordinator exposes screenshot data on local tool output events', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const artifactUploader = createMockArtifactUploader();
    const coordinator = new ToolExecutionCoordinator({
      store,
      artifactUploader,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshot: INLINE_JPEG_BASE64,
            screenshot_content_type: 'image/jpeg',
            capture_meta: {
              source_w: 100,
              source_h: 100,
              crop_x: 0,
              crop_y: 0,
              crop_w: 100,
              crop_h: 100,
              timestamp: 123,
            },
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    const claim = await coordinator.execute(event('tool_call', {
      toolName: 'screenshot',
      requestId: 'req-shot',
      toolCallId: 'call-shot',
      args: { explanation: 'Capture screen' },
    }));

    expect(claim.claimed).toBe(true);
    expect(artifactUploader.upload).toHaveBeenCalledTimes(1);
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-shot',
      success: true,
      data: expect.objectContaining({
        output: 'Screenshot captured successfully.',
        screenshot_ref: 'artifact-shot.jpg',
        screenshot_url: '/api/artifacts/artifact-shot.jpg',
        screenshot_content_type: 'image/jpeg',
      }),
    }));
    expect(sendToolResult.mock.calls[0][0].data).not.toHaveProperty('screenshot');
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-shot',
          toolCallId: 'call-shot',
          toolName: 'screenshot',
          screenshot_ref: 'artifact-shot.jpg',
          screenshot_url: '/api/artifacts/artifact-shot.jpg',
          screenshot_content_type: 'image/jpeg',
          capture_meta: expect.objectContaining({ source_w: 100 }),
        }),
      }),
    ]);
    expect(buildDisplayRows(events)).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        metadata: expect.objectContaining({
          raw: expect.objectContaining({
            screenshot_ref: 'artifact-shot.jpg',
          }),
        }),
      }),
    ]);
  });

  test('tool coordinator uploads post-action screenshots before backend delivery', async () => {
    const lifecycleCalls: string[] = [];
    const sendToolResult = jest.fn(async () => undefined);
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => ({
        artifact_id: 'mouse-after.jpg',
        content_type: 'image/jpeg',
        size_bytes: 42,
        sha256: 'sha-mouse-after',
        url: '/api/artifacts/mouse-after.jpg',
      })),
    });
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { output: 'Clicked at (46, 63)' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          screenshot: INLINE_JPEG_BASE64,
          screenshot_content_type: 'image/jpeg',
          capture_meta: { source_w: 100, source_h: 100 },
        },
      });
    const coordinator = new ToolExecutionCoordinator({
      artifactUploader,
      localRuntime: { executeTool },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
      localToolLifecycle: {
        beforeExecute: jest.fn(async (call) => {
          lifecycleCalls.push(`before:${call.toolName}`);
          return () => {
            lifecycleCalls.push(`release:${call.toolName}`);
          };
        }),
      },
    });

    await coordinator.execute(event('tool_call', {
      toolName: 'mouse_control',
      requestId: 'req-click',
      args: { action: 'click', x: 46, y: 63, wait: 0 },
    }));

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(lifecycleCalls).toEqual([
      'before:mouse_control',
      'release:mouse_control',
      'before:screenshot',
      'release:screenshot',
    ]);
    expect(artifactUploader.upload).toHaveBeenCalledTimes(1);
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-click',
      success: true,
      data: expect.objectContaining({
        output: 'Clicked at (46, 63)',
        screenshot_ref: 'mouse-after.jpg',
        screenshot_url: '/api/artifacts/mouse-after.jpg',
        post_action_screenshot: true,
        post_action_screenshot_tool: 'mouse_control',
      }),
    }));
    expect(sendToolResult.mock.calls[0][0].data).not.toHaveProperty('screenshot');
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
          data: { output: 'local output' },
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

  test('tool coordinator fails loudly when screenshot artifact uploader is missing', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshot: INLINE_JPEG_BASE64,
            screenshot_content_type: 'image/jpeg',
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await expect(coordinator.execute(event('tool_call', {
      toolName: 'screenshot',
      requestId: 'req-missing-uploader',
      args: { explanation: 'Capture screen' },
    }))).rejects.toThrow('artifact_upload_failed');

    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-missing-uploader',
          success: false,
          deliveryFailed: true,
          error: expect.stringContaining('artifact_upload_failed'),
        }),
      }),
    ]);
  });

  test('tool coordinator fails loudly when screenshot artifact upload fails', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => {
        throw new Error('artifact service unavailable');
      }),
    });
    const coordinator = new ToolExecutionCoordinator({
      store,
      artifactUploader,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshot: INLINE_JPEG_BASE64,
            screenshot_content_type: 'image/jpeg',
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await expect(coordinator.execute(event('tool_call', {
      toolName: 'screenshot',
      requestId: 'req-upload-failed',
      args: { explanation: 'Capture screen' },
    }))).rejects.toThrow('artifact_upload_failed: artifact service unavailable');

    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-upload-failed',
          success: false,
          deliveryFailed: true,
          error: expect.stringContaining('artifact_upload_failed: artifact service unavailable'),
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
    expect(bundlePayload.step_results[0].output.output).toBe('one');
    expect(bundlePayload.step_results[1]).toEqual({
      tool: 'read_file',
      status: 'error',
      output: { output: 'failed-two' },
    });
  });

  test('tool coordinator captures bundle screenshot after skipped invalid step', async () => {
    const lifecycleCalls: string[] = [];
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { output: 'typed' } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          screenshot_ref: 'after-shifted.jpg',
          screenshot_content_type: 'image/jpeg',
        },
      });
    const sendToolBundleResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: { executeTool },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult,
      localToolLifecycle: {
        beforeExecute: jest.fn(async (call) => {
          lifecycleCalls.push(`before:${call.toolName}`);
          return () => {
            lifecycleCalls.push(`release:${call.toolName}`);
          };
        }),
      },
    });

    const claim = await coordinator.execute(event('tool_bundle_call', {
      bundleId: 'bundle-shifted-action',
      tools: [
        {},
        { name: 'keyboard_control', args: { action: 'type', text: '123456', wait: 0 } },
      ],
    }));

    expect(claim.claimed).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(lifecycleCalls).toEqual([
      'before:keyboard_control',
      'release:keyboard_control',
      'before:screenshot',
      'release:screenshot',
    ]);
    expect(executeTool).toHaveBeenNthCalledWith(2, {
      toolName: 'screenshot',
      args: {
        explanation: 'Capturing the screen after bundled computer-use execution.',
        wait: 0,
      },
      turnRef: 'turn-1',
      conversationRef: 'conv-sdk-runtime',
    });
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-shifted-action',
      status: 'success',
      screenshot_ref: 'after-shifted.jpg',
      screenshot_content_type: 'image/jpeg',
      step_results: [
        { tool: 'keyboard_control', status: 'ok', output: expect.objectContaining({ output: 'typed' }) },
      ],
    }));
  });

  test('tool coordinator promotes explicit bundle screenshot after skipped invalid step', async () => {
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          output: 'Screenshot captured',
          screenshot_ref: 'explicit-shifted.jpg',
        },
      });
    const sendToolBundleResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: { executeTool },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult,
    });

    const claim = await coordinator.execute(event('tool_bundle_call', {
      bundleId: 'bundle-explicit-shifted-shot',
      tools: [
        {},
        { name: 'screenshot', args: { explanation: 'Checking Messages' } },
      ],
    }));

    expect(claim.claimed).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-explicit-shifted-shot',
      screenshot_ref: 'explicit-shifted.jpg',
      step_results: [
        { tool: 'screenshot', status: 'ok', output: expect.objectContaining({ screenshot_ref: 'explicit-shifted.jpg' }) },
      ],
    }));
  });

  test('tool coordinator uploads explicit bundle screenshot outputs before backend delivery', async () => {
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => ({
        artifact_id: 'bundle-explicit.jpg',
        content_type: 'image/jpeg',
        size_bytes: 42,
        sha256: 'sha-bundle-explicit',
        url: '/api/artifacts/bundle-explicit.jpg',
      })),
    });
    const executeTool = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: {
          output: 'Screenshot captured',
          screenshot: INLINE_JPEG_BASE64,
          screenshot_content_type: 'image/jpeg',
        },
      });
    const sendToolBundleResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      artifactUploader,
      localRuntime: { executeTool },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult,
    });

    await coordinator.execute(event('tool_bundle_call', {
      bundleId: 'bundle-inline-shot',
      tools: [
        { name: 'screenshot', args: { explanation: 'Checking Messages' } },
      ],
    }));

    expect(artifactUploader.upload).toHaveBeenCalledTimes(1);
    expect(sendToolBundleResult).toHaveBeenCalledWith(expect.objectContaining({
      bundle_id: 'bundle-inline-shot',
      screenshot_ref: 'bundle-explicit.jpg',
      screenshot_url: '/api/artifacts/bundle-explicit.jpg',
      step_results: [
        {
          tool: 'screenshot',
          status: 'ok',
          output: expect.objectContaining({
            screenshot_ref: 'bundle-explicit.jpg',
            screenshot_url: '/api/artifacts/bundle-explicit.jpg',
          }),
        },
      ],
    }));
    const bundlePayload = sendToolBundleResult.mock.calls[0][0];
    expect(bundlePayload).not.toHaveProperty('screenshot');
    expect(bundlePayload.step_results[0].output).not.toHaveProperty('screenshot');
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
    const snapshot = await runtime.load();
    const rehydrate = await runtime.rehydrate();

    expect(snapshot.displayRows).toEqual([
      expect.objectContaining({
        role: 'user',
        type: 'user_message',
        content: 'hello',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-send',
      }),
    ]);
    expect(sentQueries[0]).toMatchObject({
      text: 'hello',
      conversation_ref: 'conv-sdk-runtime',
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'hello',
        conversation_ref: 'conv-sdk-runtime',
      }),
      { messageId: 'turn-send' },
    );
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

  test('conversation runtime does not repair explicit rehydrate payload identity', async () => {
    const rehydrateConversation = jest.fn(async () => undefined);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockBackendTransport({
        rehydrateConversation,
      }),
    });

    await runtime.rehydrateMessages({
      messages: [],
      rehydrate_mode: 'replace',
    } as any);

    expect(rehydrateConversation).toHaveBeenCalledWith({
      messages: [],
      rehydrate_mode: 'replace',
    });
  });

  test('conversation runtime records memory diagnostics emitted during query enrichment', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport(),
      enrichQuery: async input => {
        await input.emitDiagnostic?.({
          stage: 'embedding_request_failed',
          conversationRef: input.conversationRef,
          userId: 'user-sdk-runtime',
          queryLength: input.text.length,
          message: 'Memory retrieval skipped because the backend embedding request failed.',
          error: '503 Service Unavailable',
        });
        return { content: '<user_query>hello</user_query>' };
      },
    });

    await runtime.send({ text: 'hello', turnRef: 'turn-memory-diag' });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'turn_started',
      'memory_retrieval_diagnostic',
      'user_message',
    ]);
    expect(events[1]).toMatchObject({
      type: 'memory_retrieval_diagnostic',
      source: 'sdk',
      turnRef: 'turn-memory-diag',
      payload: expect.objectContaining({
        stage: 'embedding_request_failed',
        error: '503 Service Unavailable',
      }),
    });
  });

  test('conversation runtime emits memory persistence diagnostics before terminal turn notification', async () => {
    const notifiedTypes: string[] = [];
    const transport = createControllableBackendTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        embeddings: {
          create: jest.fn(async () => ({
            embedding: [0.1],
            embedding_space_version: 'embed-v1',
          })),
        },
      } as any,
      localRuntime: {
        rpc: jest.fn(async () => ({
          success: true,
          data: { memory_id: 'mem-1' },
        })),
      },
      userId: 'user-sdk-runtime',
    });
    runtime.subscribeEvents(event => {
      notifiedTypes.push(event.type);
    });
    runtime.attachTransport();

    await runtime.send({ text: 'hello', turnRef: 'turn-store-memory' });
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'world' },
      {
        eventId: 'turn-store-memory-evt-000001-streaming-complete',
        turnRef: 'turn-store-memory',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(notifiedTypes).toContain('turn_completed');
    });
    expect(notifiedTypes.slice(-2)).toEqual([
      'memory_persistence_diagnostic',
      'turn_completed',
    ]);
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toContain('memory_persistence_diagnostic');
    expect(events.find(storedEvent => storedEvent.type === 'memory_persistence_diagnostic')).toMatchObject({
      payload: expect.objectContaining({
        stage: 'store_succeeded',
        memoryId: 'mem-1',
      }),
    });
  });

  test('conversation runtime stores completed-turn memory from the pending turn ledger', async () => {
    const transport = createControllableBackendTransport();
    const store = new InMemoryConversationStore();
    const embeddingsCreate = jest.fn(async () => ({
      embedding: [0.1],
      embedding_space_version: 'embed-v1',
    }));
    const rpc = jest.fn(async () => ({
      success: true,
      data: { memory_id: 'mem-ledger' },
    }));
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        embeddings: {
          create: embeddingsCreate,
        },
      } as any,
      localRuntime: { rpc },
      userId: 'user-sdk-runtime',
    });
    runtime.attachTransport();

    await runtime.send({ text: 'hello from ledger', turnRef: 'turn-ledger-memory' });
    (runtime as any).events = [];
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'ledger response' },
      {
        eventId: 'turn-ledger-memory-evt-000001-streaming-complete',
        turnRef: 'turn-ledger-memory',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(rpc).toHaveBeenCalled();
    });
    expect(embeddingsCreate).toHaveBeenCalledWith({
      text: 'User: hello from ledger\nAssistant: ledger response',
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      method: 'store_memory_by_embedding',
      params: expect.objectContaining({
        user_id: 'user-sdk-runtime',
        content: 'User: hello from ledger\nAssistant: ledger response',
      }),
    }));
  });

  test('conversation runtime emits a deterministic diagnostic when completed turn state is missing', async () => {
    const transport = createControllableBackendTransport();
    const store = new InMemoryConversationStore();
    const embeddingsCreate = jest.fn(async () => ({
      embedding: [0.1],
      embedding_space_version: 'embed-v1',
    }));
    const rpc = jest.fn(async () => ({
      success: true,
      data: { memory_id: 'mem-missing' },
    }));
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        embeddings: {
          create: embeddingsCreate,
        },
      } as any,
      localRuntime: { rpc },
      userId: 'user-sdk-runtime',
    });
    runtime.attachTransport();

    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'orphan response' },
      {
        eventId: 'turn-missing-ledger-evt-000001-streaming-complete',
        turnRef: 'turn-missing-ledger',
        sequence: 1,
      },
    ));

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.find(storedEvent => storedEvent.type === 'memory_persistence_diagnostic')).toMatchObject({
        payload: expect.objectContaining({
          stage: 'turn_state_missing',
          userQueryLength: 0,
          assistantResponseLength: 'orphan response'.length,
        }),
      });
    });
    expect(embeddingsCreate).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test('conversation runtime processes backend events serially', async () => {
    const notifiedTypes: string[] = [];
    const transport = createControllableBackendTransport();
    let releaseAssistantAppend!: () => void;
    const assistantAppendBlocker = new Promise<void>(resolve => {
      releaseAssistantAppend = resolve;
    });
    const assistantAppendStarted = jest.fn();
    class DelayedAppendStore extends InMemoryConversationStore {
      async appendEvent(eventToAppend: ConversationEvent): Promise<void> {
        if (eventToAppend.type === 'assistant_delta') {
          assistantAppendStarted();
          await assistantAppendBlocker;
        }
        await super.appendEvent(eventToAppend);
      }
    }
    const store = new DelayedAppendStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        embeddings: {
          create: jest.fn(async () => ({
            embedding: [0.1],
            embedding_space_version: 'embed-v1',
          })),
        },
      } as any,
      localRuntime: {
        rpc: jest.fn(async () => ({
          success: true,
          data: { memory_id: 'mem-serial' },
        })),
      },
      userId: 'user-sdk-runtime',
    });
    runtime.subscribeEvents(event => {
      notifiedTypes.push(event.type);
    });
    runtime.attachTransport();

    await runtime.send({ text: 'serialize me', turnRef: 'turn-serial' });
    transport.emit(backendEvent(
      'streaming-response',
      { text: 'partial' },
      {
        eventId: 'turn-serial-evt-000001-streaming-response',
        turnRef: 'turn-serial',
        sequence: 1,
      },
    ));
    await waitForExpect(() => {
      expect(assistantAppendStarted).toHaveBeenCalled();
    });
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'done' },
      {
        eventId: 'turn-serial-evt-000002-streaming-complete',
        turnRef: 'turn-serial',
        sequence: 2,
      },
    ));
    await tick();
    await tick();

    expect(notifiedTypes).not.toContain('turn_completed');
    releaseAssistantAppend();
    await waitForExpect(() => {
      expect(notifiedTypes).toContain('turn_completed');
    });
    expect(notifiedTypes.indexOf('assistant_delta')).toBeLessThan(notifiedTypes.indexOf('turn_completed'));
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
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'use the selected model',
        conversation_ref: 'conv-sdk-runtime',
      }),
      { messageId: 'turn-model' },
    );
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

  test('scenario: tool turn, compaction, edit resend, and reload keep tool call/output pairs adjacent', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const sentRehydrates: Record<string, unknown>[] = [];
    const sentToolResults: Record<string, unknown>[] = [];
    const transport = createControllableBackendTransport({
      sendQuery: jest.fn(async payload => {
        sentQueries.push(payload);
        return `query-${sentQueries.length}`;
      }),
      rehydrateConversation: jest.fn(async payload => {
        sentRehydrates.push(payload);
      }),
      sendToolResult: jest.fn(async payload => {
        sentToolResults.push(payload);
      }),
    });
    const executeTool = jest.fn(async call => ({
      success: true,
      data: {
        output: `local display for ${call.args.path}`,
        output: `local model content for ${call.args.path}`,
      },
    }));
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      localRuntime: { executeTool },
    });
    runtime.attachTransport();

    await runtime.send({
      text: 'Read README.md and summarize it.',
      turnRef: 'turn-original',
    });
    transport.emit(backendEvent('tool-call', {
      tool_name: 'read_file',
      request_id: 'req-original',
      parameters: { path: 'README.md' },
      metadata: {
        model_facing_tool_call: {
          id: 'call-original',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"README.md"}',
          },
        },
      },
    }, { eventId: 'backend-tool-call-original', turnRef: 'turn-original' }));

    await waitForExpect(() => {
      expect(sentToolResults).toHaveLength(1);
    });
    transport.emit(backendEvent('tool-output', {
      tool_name: 'read_file',
      request_id: 'req-original',
      tool_call_id: 'call-original',
      output: 'backend accepted README contents',
    }, { eventId: 'backend-tool-output-original', turnRef: 'turn-original' }));
    transport.emit(backendEvent('context-compaction-started', {
      reason: 'auto-pre-query',
      before_tokens: 360000,
    }, { eventId: 'compaction-start-original', turnRef: 'turn-original' }));
    transport.emit(backendEvent('context-compaction-completed', {
      generation_id: 'gen-original',
      reason: 'auto-pre-query',
      strategy: 'inline',
      before_tokens: 360000,
      after_tokens: 48000,
      summary_preview: 'Earlier README summary.',
      replacement_history_entries: [
        {
          role: 'assistant',
          content: 'Earlier README summary.',
          message_type: 'context_compaction',
        },
      ],
      skipped_reason: null,
    }, { eventId: 'compaction-complete-original', turnRef: 'turn-original' }));
    transport.emit(backendEvent('assistant-message-full', {
      content: 'README summary done.',
    }, { eventId: 'assistant-original', turnRef: 'turn-original' }));
    transport.emit(backendEvent('streaming-complete', {
      final_response: 'README summary done.',
    }, { eventId: 'complete-original', turnRef: 'turn-original' }));

    await waitForExpect(async () => {
      const snapshot = await runtime.load();
      expect(snapshot.state.phase).toBe('completed');
    });

    const originalSnapshot = await runtime.load();
    expect(originalSnapshot.display.compaction).toMatchObject({
      status: 'applied',
      generationId: 'gen-original',
    });
    expect(originalSnapshot.display.messages.map(message => message.messageType)).toEqual([
      'user_message',
      'tool_call',
      'tool_output',
      'assistant_message',
    ]);
    expect(originalSnapshot.display.messages.slice(1, 3)).toEqual([
      expect.objectContaining({
        messageType: 'tool_call',
        requestId: 'req-original',
        toolCallId: 'call-original',
      }),
      expect.objectContaining({
        messageType: 'tool_output',
        requestId: 'req-original',
        toolCallId: 'call-original',
        text: 'backend accepted README contents',
      }),
    ]);
    expect(originalSnapshot.rehydrate.messages.slice(1, 3)).toEqual([
      expect.objectContaining({
        role: 'assistant',
        tool_call_id: 'call-original',
      }),
      expect.objectContaining({
        role: 'tool',
        content: 'backend accepted README contents',
        tool_call_id: 'call-original',
      }),
    ]);

    const originalUser = (await store.loadEvents('conv-sdk-runtime'))
      .find(storedEvent => storedEvent.type === 'user_message');
    expect(originalUser).toBeDefined();

    await runtime.editAndResend({
      messageId: originalUser!.eventId,
      text: 'Read package.json and summarize it in bullets.',
      turnRef: 'turn-edited',
    });

    expect(sentQueries).toEqual([
      expect.objectContaining({
        text: 'Read README.md and summarize it.',
        conversation_ref: 'conv-sdk-runtime',
      }),
      expect.objectContaining({
        text: 'Read package.json and summarize it in bullets.',
        conversation_ref: 'conv-sdk-runtime',
      }),
    ]);
    expect(sentRehydrates).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-sdk-runtime',
        rehydrate_mode: 'replace',
        messages: [],
      }),
    ]);
    let rewrittenEvents = await store.loadEvents('conv-sdk-runtime');
    expect(rewrittenEvents.map(storedEvent => storedEvent.eventId)).not.toEqual(
      expect.arrayContaining([
        'backend-tool-call-original',
        'backend-tool-output-original',
        'assistant-original',
        'compaction-complete-original',
      ]),
    );

    transport.emit(backendEvent('tool-call', {
      tool_name: 'read_file',
      request_id: 'req-edited',
      parameters: { path: 'package.json' },
      metadata: {
        model_facing_tool_call: {
          id: 'call-edited',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"package.json"}',
          },
        },
      },
    }, { eventId: 'backend-tool-call-edited', turnRef: 'turn-edited' }));

    await waitForExpect(() => {
      expect(sentToolResults).toHaveLength(2);
    });
    transport.emit(backendEvent('tool-output', {
      tool_name: 'read_file',
      request_id: 'req-edited',
      tool_call_id: 'call-edited',
      output: 'backend accepted package contents',
    }, { eventId: 'backend-tool-output-edited', turnRef: 'turn-edited' }));
    transport.emit(backendEvent('assistant-message-full', {
      content: '- package summary',
    }, { eventId: 'assistant-edited', turnRef: 'turn-edited' }));
    transport.emit(backendEvent('streaming-complete', {
      final_response: '- package summary',
    }, { eventId: 'complete-edited', turnRef: 'turn-edited' }));

    await waitForExpect(async () => {
      const snapshot = await runtime.load();
      expect(snapshot.state.phase).toBe('completed');
    });

    const finalSnapshot = await runtime.load();
    expect(executeTool.mock.calls.map(([call]) => call.args.path)).toEqual([
      'README.md',
      'package.json',
    ]);
    expect(finalSnapshot.display.compaction.status).toBe('idle');
    expect(finalSnapshot.display.messages.map(message => message.messageType)).toEqual([
      'user_message',
      'tool_call',
      'tool_output',
      'assistant_message',
    ]);
    expect(finalSnapshot.display.messages[0]).toEqual(expect.objectContaining({
      text: 'Read package.json and summarize it in bullets.',
    }));
    expect(finalSnapshot.display.messages.slice(1, 3)).toEqual([
      expect.objectContaining({
        messageType: 'tool_call',
        requestId: 'req-edited',
        toolCallId: 'call-edited',
      }),
      expect.objectContaining({
        messageType: 'tool_output',
        requestId: 'req-edited',
        toolCallId: 'call-edited',
        text: 'backend accepted package contents',
      }),
    ]);
    expect(finalSnapshot.display.messages).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ text: 'Read README.md and summarize it.' }),
        expect.objectContaining({ toolCallId: 'call-original' }),
      ]),
    );
    expect(finalSnapshot.rehydrate.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Read package.json and summarize it in bullets.',
      }),
      expect.objectContaining({
        role: 'assistant',
        tool_call_id: 'call-edited',
      }),
      expect.objectContaining({
        role: 'tool',
        content: 'backend accepted package contents',
        tool_call_id: 'call-edited',
        tool_name: 'read_file',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: '- package summary',
      }),
    ]);
    expect((await store.loadForDisplay('conv-sdk-runtime')).messages).toEqual(
      finalSnapshot.display.messages,
    );
    expect((await store.loadForRehydrate('conv-sdk-runtime')).messages).toEqual(
      finalSnapshot.rehydrate.messages,
    );
    rewrittenEvents = await store.loadEvents('conv-sdk-runtime');
    expect(rewrittenEvents.some(storedEvent => storedEvent.type === 'compaction_applied')).toBe(false);
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

  test('conversation runtime rejects when transport cannot send a query', async () => {
    const sendQuery = jest.fn(async () => null);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockBackendTransport({
        sendQuery: sendQuery as unknown as BackendTransport['sendQuery'],
      }),
    });

    await expect(runtime.send({
      text: 'send failure',
      turnRef: 'turn-send-failure',
    })).rejects.toThrow('Failed to send query to backend');
    expect(sendQuery).toHaveBeenCalledTimes(1);
  });

  test('conversation runtime close clears snapshot and event listeners', async () => {
    const snapshotListener = jest.fn();
    const eventListener = jest.fn();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockBackendTransport(),
    });
    runtime.subscribe(snapshotListener);
    runtime.subscribeEvents(eventListener);
    await tick();
    snapshotListener.mockClear();

    runtime.close();
    await runtime.stop('turn-after-close');

    expect(snapshotListener).not.toHaveBeenCalled();
    expect(eventListener).not.toHaveBeenCalled();
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
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'stream this',
        conversation_ref: 'conv-sdk-runtime',
      }),
      { messageId: 'turn-stream' },
    );
    expect(backendListener).toBeTruthy();
    backendListener?.(stampBackendEvent({
      type: 'streaming-response',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { text: 'partial' },
    } satisfies BackendEvent));
    backendListener?.(stampBackendEvent({
      type: 'assistant-message-full',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { content: 'done' },
    } satisfies BackendEvent));
    backendListener?.(stampBackendEvent({
      type: 'streaming-complete',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-stream',
      payload: { final_response: 'done' },
    } satisfies BackendEvent));

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
    backendListeners.forEach(listener => listener(stampBackendEvent({
      type: 'streaming-response',
      conversation_ref: 'conv-first',
      turn_ref: 'turn-first',
      payload: { text: 'first chunk' },
    } satisfies BackendEvent)));
    backendListeners.forEach(listener => listener(stampBackendEvent({
      type: 'streaming-response',
      conversation_ref: 'conv-first',
      turn_ref: 'turn-old',
      payload: { text: 'stale chunk' },
    } satisfies BackendEvent)));
    backendListeners.forEach(listener => listener({
      type: 'streaming-response',
      payload: { text: 'ambiguous chunk' },
    } satisfies BackendEvent));
    await tick();

    expect((await store.loadEvents('conv-first')).filter(storedEvent => storedEvent.type === 'assistant_delta')).toHaveLength(1);
    expect((await store.loadEvents('conv-second')).filter(storedEvent => storedEvent.type === 'assistant_delta')).toHaveLength(0);
  });

  test('conversation runtime ignores duplicate backend event ids', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport({
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    const eventPayload = backendEvent(
      'streaming-response',
      { text: 'one chunk' },
      {
        eventId: 'turn-dupe-evt-000001-streaming-response',
        turnRef: 'turn-dupe',
        sequence: 1,
      },
    );
    backendListener?.(eventPayload);
    backendListener?.(eventPayload);
    await tick();

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.filter(storedEvent => storedEvent.type === 'assistant_delta')).toHaveLength(1);
  });

  test('conversation runtime records backend sequence gaps before accepting later event', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport({
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    backendListener?.(backendEvent(
      'streaming-response',
      { text: 'late chunk' },
      {
        eventId: 'turn-gap-evt-000003-streaming-response',
        turnRef: 'turn-gap',
        sequence: 3,
      },
    ));
    await tick();

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'runtime_error',
      'assistant_delta',
    ]);
    expect(events[0].payload).toMatchObject({
      reason: 'backend_sequence_gap',
      missing_sequence_start: 1,
      missing_sequence_end: 2,
    });
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
            output: `read ${String(call.args.path)}`,
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
      id: 'turn-tool',
      event_id: 'turn-tool-evt-000001-tool-call',
      sequence: 1,
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
        output: 'read README.md',
      },
    });
    expect((await store.loadEvents('conv-sdk-runtime')).map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'tool_output',
    ]);
    expect((await runtime.load()).state.phase).toBe('tool_result_sent');
  });

  test('conversation runtime passes sdk artifact upload to local tool result delivery', async () => {
    const sentToolResults: Record<string, unknown>[] = [];
    let backendListener: ((event: unknown) => void) | null = null;
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => ({
        artifact_id: 'runtime-shot.jpg',
        content_type: 'image/jpeg',
        size_bytes: 42,
        sha256: 'sha-runtime-shot',
        url: '/api/artifacts/runtime-shot.jpg',
      })),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      sdkClient: {
        artifacts: artifactUploader,
      } as any,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshot: INLINE_JPEG_BASE64,
            screenshot_content_type: 'image/jpeg',
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

    backendListener?.(stampBackendEvent({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'screenshot',
        request_id: 'req-shot',
        parameters: { explanation: 'Capture screen' },
      },
    } satisfies BackendEvent));
    await waitForExpect(() => {
      expect(sentToolResults).toHaveLength(1);
    });

    expect(artifactUploader.upload).toHaveBeenCalledTimes(1);
    expect(sentToolResults[0]).toMatchObject({
      request_id: 'req-shot',
      success: true,
      data: {
        output: 'Screenshot captured successfully.',
        screenshot_ref: 'runtime-shot.jpg',
        screenshot_url: '/api/artifacts/runtime-shot.jpg',
        screenshot_content_type: 'image/jpeg',
      },
    });
    expect((sentToolResults[0] as any).data).not.toHaveProperty('screenshot');
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
            output: 'read README.md',
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

    backendListener?.(stampBackendEvent({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        request_id: 'req-read',
        parameters: { path: 'README.md' },
      },
    } satisfies BackendEvent));
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
        output: 'should not run',
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

    backendListener?.(stampBackendEvent({
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tool_name: 'read_file',
        parameters: { path: 'README.md' },
      },
    } satisfies BackendEvent));
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

  test('conversation runtime records malformed bundle events without invoking sidecar', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const executeTool = jest.fn(async () => ({
      success: true,
      data: {
        output: 'should not run',
      },
    }));
    const sendToolBundleResult = jest.fn(async () => undefined);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      localRuntime: {
        executeTool,
      },
      transport: createMockBackendTransport({
        sendToolBundleResult,
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
      }),
    });
    runtime.attachTransport();

    backendListener?.(stampBackendEvent({
      type: 'tool-bundle',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-tool',
      payload: {
        tools: [
          { name: 'read_file', args: { path: 'README.md' } },
        ],
      },
    } satisfies BackendEvent));
    await tick();
    await tick();

    expect(executeTool).not.toHaveBeenCalled();
    expect(sendToolBundleResult).not.toHaveBeenCalled();
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'tool_bundle_call',
      'runtime_error',
    ]);
    expect(events[1].payload).toMatchObject({
      reason: 'malformed_tool_event',
      claimReason: 'missing-bundle-id-or-tools',
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
      artifactRefs: ['artifact-old'],
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
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
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
  });

  test('prepareEditAndResend rewrites and rehydrates without sending a query', async () => {
    const sendQuery = jest.fn(async () => 'query-should-not-send');
    const sentRehydrates: Record<string, unknown>[] = [];
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-edit',
        payload: { text: 'old text', screenshot_ref: 'artifact-old' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'assistant-stale',
        payload: { text: 'stale answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport({
        sendQuery,
        rehydrateConversation: jest.fn(async payload => {
          sentRehydrates.push(payload);
        }),
      }),
    });

    await runtime.load();
    const prepared = await runtime.prepareEditAndResend({
      messageId: 'user-edit',
      text: 'new text',
      payload: { screenshot_ref: 'artifact-new' },
      turnRef: 'turn-prepared',
    });

    expect(sendQuery).not.toHaveBeenCalled();
    expect(sentRehydrates).toHaveLength(1);
    expect(prepared).toEqual(expect.objectContaining({
      text: 'new text',
      turnRef: 'turn-prepared',
      payload: expect.objectContaining({
        screenshot_ref: 'artifact-new',
      }),
    }));
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('assistant-stale');
    expect(events.map(storedEvent => storedEvent.type)).toEqual([
      'conversation_rewritten',
    ]);
  });

  test('prepareEditAndResend can locate legacy renderer messages by user ordinal', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-user-1',
        payload: { text: 'first text' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-assistant-1',
        payload: { text: 'first answer' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-user-2',
        payload: { text: 'second text' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-assistant-2',
        payload: { text: 'second answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport(),
    });

    await runtime.load();
    const prepared = await runtime.prepareEditAndResend({
      messageId: 'renderer-only-user-id',
      userMessageOrdinal: 1,
      text: 'edited second text',
    });

    expect(prepared.text).toBe('edited second text');
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('stored-user-2');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('stored-assistant-2');
  });

  test('prepareRetryTurn rewrites and rehydrates without sending a query', async () => {
    const sendQuery = jest.fn(async () => 'query-should-not-send');
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
        sendQuery,
      }),
    });

    await runtime.load();
    const prepared = await runtime.prepareRetryTurn({
      messageId: 'assistant-retry',
      turnRef: 'turn-retry',
    });

    expect(sendQuery).not.toHaveBeenCalled();
    expect(prepared).toEqual(expect.objectContaining({
      text: 'try this again',
      turnRef: 'turn-retry',
    }));
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('assistant-retry');
  });

  test('prepareRetryTurn can locate legacy renderer messages by user ordinal', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-user-1',
        payload: { text: 'first retry' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-assistant-1',
        payload: { text: 'first bad answer' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-user-2',
        payload: { text: 'second retry' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'stored-assistant-2',
        payload: { text: 'second bad answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockBackendTransport(),
    });

    await runtime.load();
    const prepared = await runtime.prepareRetryTurn({
      messageId: 'renderer-only-assistant-id',
      userMessageOrdinal: 1,
    });

    expect(prepared.text).toBe('second retry');
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('stored-user-2');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain('stored-assistant-2');
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
