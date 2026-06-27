/**
 * Covers Agent SDK conversation runtime behavior in the frontend test suite.
 */

import {
  type BackendEvent,
  buildConversationView,
  buildConversationViewBuildDiagnostics,
  buildCurrentTurnProjection,
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
  buildTraceTimeline,
  createConversationEvent,
  InMemoryConversationStore,
  SdkConversationRuntime,
  ToolExecutionCoordinator,
  type AgentRuntimeTransport,
  type ConversationEvent,
  type AgentRuntimeEvent,
  type AgentStreamEvent,
} from '../../packages/windie-sdk-js/src';
import {
  createAgentStreamEventRuntime,
} from '../../packages/windie-sdk-js/src/runtime/AgentStreamEvents';
import {
  createInitialConversationRuntimeState,
  reduceConversationRuntimeState,
} from '../../packages/windie-sdk-js/src/runtime/conversationReducer';
import {
  createDefaultTurnResourceResolvers,
} from '../../packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers';
import {
  normalizeBackendEventToConversationEvent as normalizeBackendEventToConversationEventRaw,
} from '../../packages/windie-sdk-js/src/transport/backendEventNormalizer';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentStreamEventRuntime = createAgentStreamEventRuntime();

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

function eventForTurn(
  turnRef: string,
  type: ConversationEvent['type'],
  payload: Record<string, unknown> = {},
): ConversationEvent {
  return createConversationEvent({
    type,
    conversationRef: 'conv-sdk-runtime',
    revisionId: 'rev-1',
    turnRef,
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

function createMockAgentRuntimeTransport(
  overrides: Partial<AgentRuntimeTransport> = {},
): AgentRuntimeTransport {
  return {
    connect: jest.fn(async () => undefined),
    handshake: jest.fn(async () => undefined),
    sendQuery: jest.fn(async () => 'query-unused'),
    sendToolResult: jest.fn(async () => undefined),
    sendToolBundleResult: jest.fn(async () => undefined),
    rehydrateConversation: jest.fn(async () => undefined),
    compactHistory: jest.fn(async () => 'compact-unused'),
    wakewordDetected: jest.fn(async () => 'wakeword-unused'),
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

function createControllableAgentRuntimeTransport(
  overrides: Partial<AgentRuntimeTransport> = {},
): AgentRuntimeTransport & { emit(event: BackendEvent): void } {
  const listeners = new Set<(event: unknown) => void>();
  const transport = createMockAgentRuntimeTransport({
    ...overrides,
    subscribe: jest.fn((listener: (event: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  }) as AgentRuntimeTransport & { emit(event: BackendEvent): void };
  transport.emit = (event: BackendEvent) => {
    listeners.forEach(listener => listener(stampBackendEvent(event)));
  };
  return transport;
}

function backendEvent(
  type: BackendEvent['type'],
  payload: Record<string, unknown>,
  options: { eventId: string; turnRef: string; sequence?: number; revisionId?: string },
): BackendEvent {
  return {
    id: options.turnRef,
    event_id: options.eventId,
    ...(typeof options.sequence === 'number' ? { sequence: options.sequence } : {}),
    ...(options.revisionId ? { revision_id: options.revisionId } : {}),
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

describe('Agent SDK conversation runtime core', () => {
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

  test('compaction projection ignores direct snake_case SDK payload metadata', () => {
    expect(buildDisplayConversation([
      event('compaction_skipped', { skipped_reason: 'legacy-skip' }),
    ]).compaction).toMatchObject({
      status: 'skipped',
      skippedReason: null,
      debug: expect.objectContaining({ skipped_reason: 'legacy-skip' }),
    });
    expect(buildDisplayConversation([
      event('compaction_applied', {
        generation_id: 'legacy-generation',
        summary_preview: 'legacy summary',
      }),
    ]).compaction).toMatchObject({
      status: 'applied',
      generationId: null,
      summaryPreview: null,
      debug: expect.objectContaining({ generation_id: 'legacy-generation' }),
    });
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
        toolCallDetails: {
          toolName: 'read_file',
          requestId: 'req-readme',
          displayCorrelationId: 'req-readme',
          toolCallId: 'call-readme',
        },
        modelFacingToolCall: {
          id: 'call-readme',
          name: 'read_file',
          arguments: { path: 'README.md' },
        },
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
        toolOutputDetails: {
          toolName: 'read_file',
          requestId: 'req-readme',
          displayCorrelationId: 'req-readme',
          toolCallId: 'call-readme',
          success: true,
        },
      },
    });
  });

  test('SDK display rows project live assistant deltas and settle to the final assistant row', () => {
    const liveEvents = [
      event('user_message', { text: 'hey' }),
      event('reasoning_delta', { text: 'Thinking privately.' }),
      event('assistant_delta', { text: 'Hey' }),
      event('assistant_delta', { text: ' there' }),
    ];
    const events = [
      ...liveEvents,
      event('assistant_message', { text: 'Hey there' }),
    ];

    const liveRows = buildDisplayRows(liveEvents);
    const rows = buildDisplayRows(events);

    expect(liveRows.map(row => row.type)).toEqual([
      'user_message',
      'assistant_message',
    ]);
    expect(liveRows[1]).toMatchObject({
      id: 'conv-sdk-runtime:turn-1:assistant',
      content: 'Hey there',
      isStreaming: true,
      metadata: expect.objectContaining({
        raw: expect.objectContaining({
          reasoningText: 'Thinking privately.',
        }),
      }),
    });
    expect(rows.map(row => row.type)).toEqual([
      'user_message',
      'assistant_message',
    ]);
    expect(rows[1]).toMatchObject({
      id: liveRows[1].id,
      metadata: expect.objectContaining({
        raw: expect.objectContaining({
          reasoningText: 'Thinking privately.',
        }),
      }),
    });
    expect(rows[1]).not.toHaveProperty('isStreaming');
    expect(rows.map(row => row.content)).toEqual([
      'hey',
      'Hey there',
    ]);
    expect(buildCurrentTurnProjection(events)).toMatchObject({
      assistantText: 'Hey there',
      reasoningText: 'Thinking privately.',
    });
  });

  test('SDK display rows do not reserve an assistant row for reasoning before tool rows', () => {
    const reasoningOnlyEvents = [
      event('user_message', { text: 'inspect the screen' }),
      event('reasoning_delta', { text: 'I need to inspect the available tools first.' }),
    ];
    const events = [
      ...reasoningOnlyEvents,
      event('tool_call', {
        toolName: 'screenshot',
        requestId: 'req-shot',
        toolCallId: 'call-shot',
        args: {},
      }),
      event('tool_output', {
        toolName: 'screenshot',
        requestId: 'req-shot',
        toolCallId: 'call-shot',
        result: { output: 'captured screen' },
        success: true,
      }),
      event('assistant_delta', { text: 'The screenshot is ready.' }),
      event('assistant_message', { text: 'The screenshot is ready.' }),
    ];

    const reasoningOnlyRows = buildDisplayRows(reasoningOnlyEvents);
    const rows = buildDisplayRows(events);

    expect(reasoningOnlyRows.map(row => row.type)).toEqual([
      'user_message',
    ]);
    expect(rows.map(row => row.type)).toEqual([
      'user_message',
      'tool_call',
      'tool_output',
      'assistant_message',
    ]);
    expect(rows.map(row => row.index)).toEqual([0, 1, 2, 3]);
    expect(rows[3]).toMatchObject({
      id: 'conv-sdk-runtime:turn-1:assistant',
      content: 'The screenshot is ready.',
      metadata: expect.objectContaining({
        raw: expect.objectContaining({
          reasoningText: 'I need to inspect the available tools first.',
        }),
      }),
    });
  });

  test('SDK display rows give same-turn assistant segments distinct row ids', () => {
    const events = [
      event('user_message', { text: 'find the appointment email' }),
      event('assistant_message', { text: 'I will search Gmail first.' }),
      event('tool_call', {
        toolName: 'browser_type',
        requestId: 'req-search',
        toolCallId: 'call-search',
        args: { text: 'appointment' },
      }),
      event('tool_output', {
        toolName: 'browser_type',
        requestId: 'req-search',
        toolCallId: 'call-search',
        result: { output: 'typed' },
        success: true,
      }),
      event('assistant_message', { text: 'I found the confirmation email.' }),
    ];

    const rows = buildDisplayRows(events);
    const assistantRows = rows.filter(row => row.type === 'assistant_message');

    expect(assistantRows.map(row => row.content)).toEqual([
      'I will search Gmail first.',
      'I found the confirmation email.',
    ]);
    expect(assistantRows.map(row => row.id)).toEqual([
      'conv-sdk-runtime:turn-1:assistant',
      `conv-sdk-runtime:turn-1:assistant:${events[4].eventId}`,
    ]);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  test('SDK display rows keep later same-turn streaming segments distinct from settled rows', () => {
    const events = [
      event('user_message', { text: 'work through the browser task' }),
      event('assistant_delta', { text: 'Connecting' }),
      event('assistant_message', { text: 'Connecting' }),
      event('tool_call', {
        toolName: 'browser_connect',
        requestId: 'req-connect',
        toolCallId: 'call-connect',
        args: {},
      }),
      event('tool_output', {
        toolName: 'browser_connect',
        requestId: 'req-connect',
        toolCallId: 'call-connect',
        result: { output: 'connected' },
        success: true,
      }),
      event('assistant_delta', { text: 'Connected.' }),
      event('assistant_message', { text: 'Connected.' }),
    ];

    const rows = buildDisplayRows(events);
    const assistantRows = rows.filter(row => row.type === 'assistant_message');

    expect(assistantRows.map(row => row.content)).toEqual([
      'Connecting',
      'Connected.',
    ]);
    expect(assistantRows.map(row => row.id)).toEqual([
      'conv-sdk-runtime:turn-1:assistant',
      `conv-sdk-runtime:turn-1:assistant:${events[5].eventId}`,
    ]);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  test('SDK display rows replace same-turn assistant fallback with terminal error', () => {
    const events = [
      event('user_message', { text: 'hello' }),
      event('assistant_message', {
        text: 'I completed the requested action(s), but the model returned an empty final response.',
      }),
      event('assistant_delta', {
        text: 'I completed the requested action(s), but the model returned an empty final response.',
      }),
      event('turn_error', {
        message: 'OpenAI Responses stream ended without final response payload',
        content: 'OpenAI Responses stream ended without final response payload',
      }),
    ];
    const rows = buildDisplayRows(events);
    const display = buildDisplayConversation(events);

    expect(rows.map(row => row.type)).toEqual([
      'user_message',
      'error',
    ]);
    expect(rows[1]).toMatchObject({
      role: 'system',
      type: 'error',
      content: 'OpenAI Responses stream ended without final response payload',
    });
    expect(rows.some(row => (
      row.type === 'assistant_message'
      && String(row.content).includes('empty final response')
    ))).toBe(false);
    expect(display.messages.map(message => message.messageType)).toEqual([
      'user_message',
      'turn_error',
    ]);
    expect(display.messages.map(message => message.text)).toEqual([
      'hello',
      'OpenAI Responses stream ended without final response payload',
    ]);
  });

  test('current turn projection clears assistant text on terminal error', () => {
    const projection = buildCurrentTurnProjection([
      event('turn_started'),
      event('assistant_delta', {
        text: 'I completed the requested action(s), but the model returned an empty final response.',
      }),
      event('turn_error', {
        message: 'OpenAI Responses stream ended without final response payload',
        content: 'OpenAI Responses stream ended without final response payload',
      }),
    ]);

    expect(projection).toMatchObject({
      phase: 'error',
      assistantText: '',
      lastError: 'OpenAI Responses stream ended without final response payload',
    });
    expect(projection.presentation.entries).toEqual([
      expect.objectContaining({
        type: 'error',
        text: 'OpenAI Responses stream ended without final response payload',
      }),
    ]);
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

  test('SDK display rows merge user message metadata into the existing user row', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'ui',
      payload: { text: 'hello' },
    });
    const metadata = createConversationEvent({
      eventId: 'evt-user-metadata',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: {
        text: 'hello',
        screenshotRef: 'artifact-1',
        screenshotUrl: '/api/artifacts/artifact-1',
        attachmentFilenames: ['notes.txt'],
      },
    });

    const rows = buildDisplayRows([user, metadata]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'evt-user',
      type: 'user_message',
      content: 'hello',
      metadata: expect.objectContaining({
        eventId: 'evt-user-metadata',
        screenshotRef: 'artifact-1',
        screenshot_ref: 'artifact-1',
        screenshotUrl: '/api/artifacts/artifact-1',
        screenshot_url: '/api/artifacts/artifact-1',
        screenshotRefs: ['artifact-1'],
        screenshot_refs: ['artifact-1'],
        attachments: [
          expect.objectContaining({
            kind: 'image',
            source: 'replay',
            status: 'ready',
            screenshotRef: 'artifact-1',
            screenshotUrl: '/api/artifacts/artifact-1',
          }),
        ],
        raw: expect.objectContaining({
          attachmentFilenames: ['notes.txt'],
        }),
      }),
    });
  });

  test('SDK display rows preserve screenshot metadata across later same-turn metadata replay', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'ui',
      payload: { text: 'hello my name is peter' },
    });
    const sdkMetadata = createConversationEvent({
      eventId: 'evt-user-metadata-sdk',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: {
        text: 'hello my name is peter',
        screenshot_ref: 'artifact-1',
        screenshot_url: '/api/artifacts/artifact-1',
        screenshot_refs: ['artifact-1'],
        attachment_filenames: ['clipboard-image.png'],
      },
    });
    const backendMetadata = createConversationEvent({
      eventId: 'evt-user-metadata-backend',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        text: 'hello my name is peter',
        sourceEventType: 'user-message-full',
        content: '<episodic_memory>summary</episodic_memory>',
      },
    });
    const assistant = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: { text: 'ready' },
    });

    const rows = buildDisplayRows([user, sdkMetadata, backendMetadata, assistant]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'evt-user',
      type: 'user_message',
      content: 'hello my name is peter',
      metadata: expect.objectContaining({
        eventId: 'evt-user-metadata-backend',
        screenshotRef: 'artifact-1',
        screenshot_ref: 'artifact-1',
        screenshotUrl: '/api/artifacts/artifact-1',
        screenshot_url: '/api/artifacts/artifact-1',
        screenshotRefs: ['artifact-1'],
        screenshot_refs: ['artifact-1'],
        attachments: [
          expect.objectContaining({
            kind: 'image',
            source: 'replay',
            status: 'ready',
            screenshotRef: 'artifact-1',
          }),
        ],
        raw: expect.objectContaining({
          sourceEventType: 'user-message-full',
          attachment_filenames: ['clipboard-image.png'],
        }),
      }),
    });
  });

  test('SDK display rows project ordered live visual attachments by stable id', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'ui',
      payload: { text: 'review these images' },
    });

    const rows = buildDisplayRows([user], {
      liveAttachments: {
        'conv-sdk-runtime:turn-visual': [
          {
            id: 'turn-visual:attachment:000',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            filename: 'first.png',
            contentType: 'image/png',
            previewSrc: 'data:image/png;base64,first',
          },
          {
            id: 'turn-visual:attachment:001',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            filename: 'second.png',
            contentType: 'image/png',
            previewSrc: 'data:image/png;base64,second',
          },
          {
            id: 'turn-visual:attachment:002',
            kind: 'screenshot_request',
            source: 'camera_button',
            status: 'pending_capture',
          },
        ],
      },
    });

    expect(rows[0].metadata?.attachments).toEqual([
      expect.objectContaining({
        id: 'turn-visual:attachment:000',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,first',
      }),
      expect.objectContaining({
        id: 'turn-visual:attachment:001',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,second',
      }),
      expect.objectContaining({
        id: 'turn-visual:attachment:002',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      }),
    ]);
  });

  test('SDK display rows replace live previews with ready descriptors without carrying preview bytes', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'ui',
      payload: { text: 'review this image' },
    });
    const metadata = createConversationEvent({
      eventId: 'evt-user-metadata',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'sdk',
      payload: {
        text: 'review this image',
        attachments: [{
          id: 'turn-visual:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'ready',
          screenshotRef: 'artifact-ready',
          screenshotUrl: '/api/artifacts/artifact-ready',
          contentType: 'image/png',
        }],
      },
    });

    const rows = buildDisplayRows([user, metadata], {
      liveAttachments: {
        'conv-sdk-runtime:turn-visual': [{
          id: 'turn-visual:attachment:000',
          kind: 'image',
          source: 'user_included',
          status: 'materializing',
          contentType: 'image/png',
          previewSrc: 'data:image/png;base64,live-preview',
        }],
      },
    });

    expect(rows[0].metadata?.attachments).toEqual([
      {
        id: 'turn-visual:attachment:000',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        contentType: 'image/png',
        screenshotRef: 'artifact-ready',
        screenshotUrl: '/api/artifacts/artifact-ready',
      },
    ]);
    expect(JSON.stringify(buildRehydrateSnapshot([user, metadata]))).not.toContain('live-preview');
  });

  test('SDK display rows preserve attachments across later text-only same-turn metadata', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'ui',
      payload: { text: 'review this image' },
    });
    const sdkMetadata = createConversationEvent({
      eventId: 'evt-user-metadata-sdk',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'sdk',
      payload: {
        attachments: [{
          id: 'turn-visual:attachment:000',
          kind: 'image',
          source: 'camera_button',
          status: 'ready',
          screenshotRef: 'artifact-camera',
        }],
      },
    });
    const backendMetadata = createConversationEvent({
      eventId: 'evt-user-metadata-backend',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-visual',
      source: 'backend',
      payload: {
        sourceEventType: 'user-message-full',
        content: 'backend text only',
      },
    });

    const rows = buildDisplayRows([user, sdkMetadata, backendMetadata]);

    expect(rows[0].metadata?.attachments).toEqual([
      expect.objectContaining({
        id: 'turn-visual:attachment:000',
        source: 'camera_button',
        status: 'ready',
        screenshotRef: 'artifact-camera',
      }),
    ]);
  });

  test('SDK display rows adapt old tool-output screenshot refs into typed tool-result attachments', () => {
    const rows = buildDisplayRows([
      event('tool_output', {
        toolName: 'screenshot',
        requestId: 'req-shot',
        result: { output: 'captured screen' },
        success: true,
        screenshot_refs: ['artifact-tool-1', 'artifact-tool-2'],
        screenshot_url: '/api/artifacts/artifact-tool-1',
        screenshot_content_type: 'image/png',
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'tool_output',
      metadata: expect.objectContaining({
        attachments: [
          expect.objectContaining({
            id: `${rows[0].metadata?.eventId}:attachment:000`,
            source: 'tool_result',
            status: 'ready',
            contentType: 'image/png',
            screenshotRef: 'artifact-tool-1',
            screenshotUrl: '/api/artifacts/artifact-tool-1',
          }),
          expect.objectContaining({
            id: `${rows[0].metadata?.eventId}:attachment:001`,
            source: 'tool_result',
            status: 'ready',
            contentType: 'image/png',
            screenshotRef: 'artifact-tool-2',
          }),
        ],
      }),
    });
  });

  test('current turn presentation carries typed tool-output attachments', () => {
    const projection = buildCurrentTurnProjection([
      event('turn_started'),
      event('tool_output', {
        toolName: 'screenshot',
        requestId: 'req-shot',
        result: { output: 'captured screen' },
        success: true,
        screenshot_ref: 'artifact-tool-live',
        screenshot_url: '/api/artifacts/artifact-tool-live',
      }),
    ]);

    expect(projection.toolEvents[0]).toEqual(expect.objectContaining({
      kind: 'tool_output',
      attachments: [
        expect.objectContaining({
          source: 'tool_result',
          status: 'ready',
          screenshotRef: 'artifact-tool-live',
          screenshotUrl: '/api/artifacts/artifact-tool-live',
        }),
      ],
    }));
    expect(projection.presentation.entries).toEqual([
      expect.objectContaining({
        type: 'tool-output',
        attachments: [
          expect.objectContaining({
            source: 'tool_result',
            screenshotRef: 'artifact-tool-live',
          }),
        ],
      }),
    ]);
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

  test('runtime reducer does not let compaction operation ids replace active turn identity', () => {
    const initial = createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1');
    const afterTurn = reduceConversationRuntimeState(
      initial,
      eventForTurn('turn-live', 'turn_started', {}),
    );
    const afterCompaction = reduceConversationRuntimeState(
      afterTurn,
      eventForTurn('compact-op', 'compaction_applied', {
        generationId: 'gen-compact',
        entries: [{ role: 'assistant', content: 'summary' }],
        entryCount: 1,
        complete: true,
      }),
    );

    expect(afterTurn.activeTurnRef).toBe('turn-live');
    expect(afterCompaction.activeTurnRef).toBe('turn-live');
    expect(afterCompaction.compaction.status).toBe('applied');
  });

  test('runtime reducer does not let stale old-turn diagnostics or stops replace active resend ownership', () => {
    const initial = createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1');
    const afterOldTurn = reduceConversationRuntimeState(
      initial,
      eventForTurn('turn-old', 'turn_started', {}),
    );
    const afterNewTurn = reduceConversationRuntimeState(
      afterOldTurn,
      eventForTurn('turn-new', 'user_message', { text: 'edited resend' }),
    );
    const afterOldTrace = reduceConversationRuntimeState(
      afterNewTurn,
      eventForTurn('turn-old', 'trace_event', {
        path: 'memory.persistence',
        stage: 'completed_turn',
        status: 'failed',
      }),
    );
    const afterOldMemory = reduceConversationRuntimeState(
      afterOldTrace,
      eventForTurn('turn-old', 'memory_store_changed', {
        userId: 'user-sdk-runtime',
        memoryTypes: ['episodic'],
        reason: 'completed_turn',
      }),
    );
    const afterOldStop = reduceConversationRuntimeState(
      afterOldMemory,
      eventForTurn('turn-old', 'turn_stopped', {}),
    );

    expect(afterNewTurn).toMatchObject({
      activeTurnRef: 'turn-new',
      phase: 'sending',
      stopState: { requested: false, turnRef: null },
    });
    expect(afterOldTrace).toMatchObject({
      activeTurnRef: 'turn-new',
      phase: 'sending',
    });
    expect(afterOldMemory).toMatchObject({
      activeTurnRef: 'turn-new',
      phase: 'sending',
    });
    expect(afterOldStop).toMatchObject({
      activeTurnRef: 'turn-new',
      phase: 'sending',
      stopState: { requested: false, turnRef: null },
    });
  });

  test('manual compaction preserves a completed turn as non-busy', () => {
    const initial = createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1');
    const completedTurn = [
      eventForTurn('turn-live', 'turn_started', {}),
      eventForTurn('turn-live', 'user_message', { text: 'what should I study?' }),
      eventForTurn('turn-live', 'assistant_delta', { text: 'Study the handbook.' }),
      eventForTurn('turn-live', 'turn_completed', {}),
    ];
    const afterCompleted = completedTurn.reduce(
      reduceConversationRuntimeState,
      initial,
    );
    const afterStartedCompaction = reduceConversationRuntimeState(
      afterCompleted,
      eventForTurn('compact-op', 'compaction_started', { reason: 'manual' }),
    );
    const afterAppliedCompaction = reduceConversationRuntimeState(
      afterStartedCompaction,
      eventForTurn('compact-op', 'compaction_applied', {
        generationId: 'gen-compact',
        entries: [{ role: 'assistant', content: 'summary' }],
        entryCount: 1,
        complete: true,
      }),
    );

    expect(afterCompleted).toMatchObject({
      activeTurnRef: 'turn-live',
      phase: 'completed',
    });
    expect(afterStartedCompaction).toMatchObject({
      activeTurnRef: 'turn-live',
      phase: 'completed',
      compaction: expect.objectContaining({ status: 'started' }),
    });
    expect(afterAppliedCompaction).toMatchObject({
      activeTurnRef: 'turn-live',
      phase: 'completed',
      compaction: expect.objectContaining({ status: 'applied' }),
    });

    const projection = buildCurrentTurnProjection([
      ...completedTurn,
      eventForTurn('compact-op', 'compaction_started', { reason: 'manual' }),
      eventForTurn('compact-op', 'compaction_applied', {
        generationId: 'gen-compact',
        entries: [{ role: 'assistant', content: 'summary' }],
        entryCount: 1,
        complete: true,
      }),
      eventForTurn('compact-op', 'compaction_failed', { error: 'late diagnostic' }),
    ]);

    expect(projection).toMatchObject({
      turnRef: 'turn-live',
      phase: 'complete',
      assistantText: 'Study the handbook.',
      lastError: null,
      presentation: expect.objectContaining({
        isBusy: false,
        isTerminal: true,
      }),
    });
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
        output: 'README contents',
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
          requestId: 'req-read',
        }),
        expect.objectContaining({
          kind: 'tool_output',
          toolName: 'read_file',
          requestId: 'req-read',
          text: 'README contents',
          status: 'success',
        }),
      ],
    });
  });

  test('current-turn projection exposes SDK-owned live-turn presentation state', () => {
    const awaiting = buildCurrentTurnProjection([
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
    ]);

    expect(awaiting.presentation).toMatchObject({
      phase: 'awaiting',
      typingVisible: true,
      overlayVisible: true,
      hasVisibleContent: false,
      entries: [],
      awaitingAnchor: expect.objectContaining({
        kind: 'user-message',
        rowId: awaiting.userMessageRowId,
        turnRef: 'turn-1',
        conversationRef: 'conv-sdk-runtime',
      }),
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef: 'turn-1',
        conversationRef: 'conv-sdk-runtime',
        staleGuardRef: 'turn-1',
      },
    });

    const thinking = buildCurrentTurnProjection([
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
      event('reasoning_delta', { text: 'Checking the workspace.' }),
    ]);

    expect(thinking.presentation).toMatchObject({
      typingVisible: false,
      overlayVisible: true,
      hasVisibleContent: true,
      awaitingAnchor: null,
      overlayIntent: expect.objectContaining({
        visible: true,
        mode: 'response',
      }),
      entries: [
        expect.objectContaining({
          type: 'thinking',
          text: 'Checking the workspace.',
          sourceEventType: 'reasoning_delta',
          sourceChannel: 'sdk:current-turn',
        }),
      ],
    });

    const toolAndText = buildCurrentTurnProjection([
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
      event('reasoning_delta', { text: 'Checking the workspace.' }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-read',
        correlationId: 'corr-read',
        metadata: {
          skip_local_execution: true,
          model_facing_tool_call: { id: 'call-read', name: 'read_file' },
          llm_tool_call_validation_failed: true,
          llm_tool_call_raw_tool_call_preview: '{"name":"read_file"}',
          llm_tool_call_raw_arguments_preview: '{"path":"README.md"}',
          llm_tool_call_parse_error: 'bad arguments',
        },
      }),
      event('tool_output', {
        toolName: 'read_file',
        requestId: 'req-read',
        correlationId: 'corr-read',
        output: 'README contents',
        success: true,
      }),
      event('assistant_delta', { text: 'Done.' }),
    ]);

    expect(toolAndText.presentation).toMatchObject({
      phase: 'streaming',
      typingVisible: false,
      overlayVisible: true,
      isBusy: true,
      entries: [
        expect.objectContaining({ type: 'thinking', sourceChannel: 'sdk:current-turn' }),
        expect.objectContaining({
          type: 'tool-call',
          text: '{"name":"read_file"}',
          sourceChannel: 'sdk:current-turn',
          requestId: 'req-read',
          correlationId: 'corr-read',
          executionSkipped: true,
          toolCallValidationFailed: true,
          rawToolCallPreview: '{"name":"read_file"}',
          rawArgumentsPreview: '{"path":"README.md"}',
          parseError: 'bad arguments',
          toolDisplayMetadata: expect.not.objectContaining({
            model_facing_tool_call: expect.anything(),
          }),
          modelFacingToolCall: expect.objectContaining({
            name: 'read_file',
          }),
          toolCallDetails: expect.objectContaining({
            toolName: 'read_file',
          }),
        }),
        expect.objectContaining({
          type: 'tool-output',
          text: 'README contents',
          sourceChannel: 'sdk:current-turn',
          requestId: 'req-read',
          correlationId: 'corr-read',
          success: true,
          toolOutputDetails: expect.objectContaining({
            output: 'README contents',
          }),
        }),
        expect.objectContaining({ type: 'llm-text', text: 'Done.', sourceChannel: 'sdk:current-turn' }),
      ],
    });

    const complete = buildCurrentTurnProjection([
      event('turn_started', {}),
      event('user_message', { text: 'inspect files' }),
      event('assistant_delta', { text: 'Done.' }),
      event('turn_completed', {}),
    ]);

    expect(complete.presentation).toMatchObject({
      phase: 'complete',
      typingVisible: false,
      overlayVisible: true,
      isBusy: false,
      isTerminal: true,
      entries: [
        expect.objectContaining({
          type: 'llm-text',
          text: 'Done.',
          sourceChannel: 'sdk:current-turn',
          isComplete: true,
        }),
      ],
    });
  });

  test('current-turn projection terminalizes stopped turns', () => {
    const stopped = buildCurrentTurnProjection([
      event('turn_started', {}),
      event('user_message', { text: 'stop this' }),
      event('assistant_delta', { text: 'Partial answer' }),
      event('turn_stopped', {}),
    ]);

    expect(stopped).toMatchObject({
      phase: 'complete',
      assistantText: 'Partial answer',
      presentation: expect.objectContaining({
        phase: 'complete',
        isBusy: false,
        isTerminal: true,
        hasVisibleContent: true,
        overlayVisible: true,
      }),
    });
  });

  test('current-turn presentation resets to typing for a consecutive user turn', () => {
    const projection = buildCurrentTurnProjection([
      eventForTurn('turn-1', 'turn_started', {}),
      eventForTurn('turn-1', 'user_message', { text: 'first' }),
      eventForTurn('turn-1', 'assistant_delta', { text: 'first answer' }),
      eventForTurn('turn-1', 'turn_completed', {}),
      eventForTurn('turn-2', 'turn_started', {}),
      eventForTurn('turn-2', 'user_message', { text: 'second' }),
    ]);

    expect(projection).toMatchObject({
      turnRef: 'turn-2',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      presentation: expect.objectContaining({
        typingVisible: true,
        overlayVisible: true,
        awaitingAnchor: expect.objectContaining({
          kind: 'user-message',
          rowId: projection.userMessageRowId,
          turnRef: 'turn-2',
        }),
        overlayIntent: expect.objectContaining({
          visible: true,
          mode: 'awaiting',
          staleGuardRef: 'turn-2',
        }),
        entries: [],
      }),
    });
  });

  test('current-turn projection renders tool-bundle calls and output step content', () => {
    const events = [
      event('turn_started', {}),
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
                name: 'read_file',
                arguments: { path: 'README.md' },
              },
            },
          },
        ],
      }),
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
	        kind: 'tool_call',
	        toolName: 'tool_bundle',
	        toolCalls: [
	          expect.objectContaining({ id: 'call-readme', name: 'read_file' }),
	        ],
	      }),
	      expect.objectContaining({
	        kind: 'tool_output',
	        toolName: 'tool_bundle',
	        text: expect.stringContaining('README model contents'),
	        status: 'success',
	      }),
	    ]);
    expect(projection.toolEvents[1].text).toContain('package contents');
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
        output: 'README contents',
        toolName: 'read_file',
        requestId: 'req-read',
        toolCallId: 'call-read',
      }),
    ];

	    const snapshot = buildRehydrateSnapshot(events);

	    expect(snapshot.messages).toEqual([
      expect.objectContaining({ role: 'user', message_type: 'user_query', content: 'inspect file' }),
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
        tool_call_id: 'call-read',
        tool_calls: [
          expect.objectContaining({
            id: 'call-read',
          }),
        ],
      }),
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
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
      expect.objectContaining({ role: 'user', message_type: 'user_query', content: 'inspect files' }),
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
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
        message_type: 'tool_output',
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
        message_type: 'tool_output',
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
        source: 'sdk',
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
        output: 'complete result',
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
        output: 'orphan output',
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
      expect.objectContaining({ role: 'user', message_type: 'user_query', content: 'inspect files' }),
      expect.objectContaining({ role: 'assistant', message_type: 'assistant_response', tool_call_id: 'call-complete' }),
      expect.objectContaining({ role: 'tool', message_type: 'tool_output', content: 'complete result', tool_call_id: 'call-complete' }),
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
        output: 'result by provider id only',
        toolName: 'read_file',
        toolCallId: 'call-read',
      }),
      event('tool_call', {
        toolName: 'read_file',
        requestId: 'req-second',
      }),
      event('tool_output', {
        output: 'result by wait id only',
        toolName: 'read_file',
        requestId: 'req-second',
      }),
    ];

    expect(buildRehydrateSnapshot(events).messages).toEqual([
      expect.objectContaining({ role: 'assistant', message_type: 'assistant_response', tool_call_id: 'call-read' }),
      expect.objectContaining({ role: 'tool', message_type: 'tool_output', content: 'result by provider id only', tool_call_id: 'call-read' }),
      expect.objectContaining({ role: 'assistant', message_type: 'assistant_response' }),
      expect.objectContaining({ role: 'tool', message_type: 'tool_output', content: 'result by wait id only' }),
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
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
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
      output: 'result',
    });
    expect(agentStreamEventRuntime.toolOutputStreamKey(toolOutput)).toBe('tool-call:call-read');
    expect(agentStreamEventRuntime.toolOutputStreamKeys(toolOutput)).toEqual([
      'tool-call:call-read',
      'request:req-read',
    ]);
  });

  test('agent stream projection ignores direct snake_case SDK tool identity aliases', () => {
    const toolCallEvents = agentStreamEventRuntime.toStreamEvents({
      type: 'conversation_event',
      event: event('tool_call', {
        tool_name: 'read_file',
        request_id: 'req-snake',
        tool_call_id: 'call-snake',
        parameters: { path: 'README.md' },
      }),
    } as any);

    expect(toolCallEvents).toContainEqual(expect.objectContaining({
      type: 'tool_calls',
      calls: [
        {
          toolName: 'unknown_tool',
          args: {},
          requestId: null,
          toolCallId: null,
          index: 0,
        },
      ],
    }));

    const toolOutputEvents = agentStreamEventRuntime.toStreamEvents({
      type: 'conversation_event',
      event: event('tool_output', {
        tool_name: 'read_file',
        request_id: 'req-snake',
        tool_call_id: 'call-snake',
        output: 'README contents',
        success: true,
      }),
    } as any);

    expect(toolOutputEvents).toContainEqual(expect.objectContaining({
      type: 'tool_outputs',
      outputs: [
        expect.objectContaining({
          toolName: 'unknown_tool',
          result: 'README contents',
          requestId: null,
          toolCallId: null,
          success: true,
          index: 0,
        }),
      ],
    }));
  });

  test('agent stream projection exposes injected user message content', () => {
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
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
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
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

  test('agent runtime event type projects error stream events', () => {
    const runtimeEvent: AgentRuntimeEvent = {
      type: 'error',
      error: new Error('projection failed'),
    };

    const streamEvents: AgentStreamEvent[] = agentStreamEventRuntime.toStreamEvents(runtimeEvent);

    expect(streamEvents).toEqual([
      {
        type: 'state',
        state: 'error',
        conversationRef: '',
        turnRef: null,
      },
      {
        type: 'error',
        message: 'projection failed',
        conversationRef: '',
        turnRef: null,
      },
    ]);
  });

  test('agent stream projection uses generic fallback error wording', () => {
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
      type: 'conversation_event',
      event: event('turn_error', {}),
    } as any);

    expect(streamEvents).toEqual([
      expect.objectContaining({
        type: 'state',
        state: 'error',
      }),
      expect.objectContaining({
        type: 'error',
        message: 'Agent stream failed',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
      }),
    ]);
  });

  test('agent stream projection ignores memory store invalidation events', () => {
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
      type: 'conversation_event',
      event: event('memory_store_changed', {
        userId: 'user-sdk-runtime',
        conversationRef: 'conv-sdk-runtime',
        memoryTypes: ['episodic'],
        reason: 'completed_turn',
        memoryId: 'mem-1',
      }),
    } as any);

    expect(streamEvents).toEqual([]);
    expect(streamEvents).not.toContainEqual(expect.objectContaining({ type: 'state', state: 'error' }));
  });

  test('agent stream projection ignores durable trace events', () => {
    const streamEvents = agentStreamEventRuntime.toStreamEvents({
      type: 'conversation_event',
      event: event('trace_event', {
        schemaVersion: 1,
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: null,
        path: 'memory.retrieval',
        stage: 'retrieval',
        status: 'succeeded',
        runtime: 'sdk',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
      }),
    } as any);

    expect(streamEvents).toEqual([]);
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

  test('in-memory store ignores direct snake_case SDK compaction replay payloads', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvent(event('user_message', { text: 'hello' }));
    await store.appendEvent(event('compaction_applied', {
      generation_id: 'gen-legacy',
      source_revision_id: 'rev-legacy',
      replacement_history_entries: [
        { role: 'assistant', content: 'legacy summary' },
      ],
      entry_count: 1,
      complete: true,
      active: true,
    }));

    await expect(store.loadCompactedReplay('conv-sdk-runtime')).resolves.toBeNull();
    await expect(store.loadForRehydrate('conv-sdk-runtime')).resolves.toMatchObject({
      conversationRef: 'conv-sdk-runtime',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'hello',
        }),
      ],
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
      payload: { toolName: 'read_file', requestId: 'req-1', output: 'result' },
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

  test('in-memory store normalizes invalid metadata pagination limits', async () => {
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

    await expect(store.listMetadata({ limit: -1 })).resolves.toEqual([]);
    expect((await store.listMetadata({ limit: 1.8 })).map(item => item.conversationRef)).toEqual([
      'conv-newest',
    ]);
    await expect(store.searchMetadata({ query: 'conv', limit: Number.NaN })).resolves.toEqual([]);
  });

  test('backend compaction-completed with skipped_reason normalizes to compaction_skipped', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
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
    logSpy.mockRestore();
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
        sourceEvent: expect.objectContaining({ type: 'error' }),
      }),
    });
  });

  test('backend event identity ignores camelCase payload aliases', () => {
    const normalized = normalizeBackendEventToConversationEventRaw({
      type: 'streaming-response',
      conversation_ref: 'conv-sdk-runtime',
      event_id: 'evt-camel-identity',
      sequence: 1,
      payload: {
        text: 'chunk',
        turnRef: 'turn-payload-camel',
        revisionId: 'rev-payload-camel',
      },
    } as BackendEvent, {
      fallbackRevisionId: 'rev-fallback',
    });

    expect(normalized).toMatchObject({
      type: 'assistant_delta',
      conversationRef: 'conv-sdk-runtime',
      turnRef: null,
      revisionId: 'rev-fallback',
      payload: expect.objectContaining({
        sourceEvent: expect.objectContaining({
          payload: expect.objectContaining({
            turnRef: 'turn-payload-camel',
            revisionId: 'rev-payload-camel',
          }),
        }),
      }),
    });
  });

  test('active backend error envelope can use message id as turn scope', () => {
    const normalized = normalizeBackendEventToConversationEventRaw({
      id: 'turn-active-error',
      type: 'error',
      payload: { message: 'Internal server error. Start a new chat and try again.' },
    } as BackendEvent, {
      fallbackConversationRef: 'conv-sdk-runtime',
      fallbackRevisionId: 'rev-1',
      fallbackTurnRef: 'turn-active-error',
    });

    expect(normalized).toMatchObject({
      type: 'turn_error',
      source: 'backend',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-active-error',
      payload: expect.objectContaining({
        message: 'Internal server error. Start a new chat and try again.',
        content: 'Internal server error. Start a new chat and try again.',
        sourceEvent: expect.objectContaining({ type: 'error' }),
      }),
    });
  });

  test('unscoped backend error with unrelated id does not attach to active turn', () => {
    const normalized = normalizeBackendEventToConversationEventRaw({
      id: 'settings-update-request',
      type: 'error',
      payload: { message: 'settings failed' },
    } as BackendEvent, {
      fallbackConversationRef: 'conv-sdk-runtime',
      fallbackRevisionId: 'rev-1',
      fallbackTurnRef: 'turn-active-error',
    });

    expect(normalized).toBeNull();
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
        sourceEvent: expect.objectContaining({ type: 'token-count' }),
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
        sourceEvent: expect.objectContaining({ type: 'llm-thought' }),
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
        sourceEventType: 'web-search-progress',
        structuredPayload: expect.objectContaining({ query: 'example' }),
        sourceEvent: expect.objectContaining({ type: 'web-search-progress' }),
      }),
    });
  });

  test('backend web search progress ignores camelCase correlation aliases', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'web-search-progress',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-search',
      payload: {
        text: 'Searching example.com',
        requestId: 'req-camel-search',
        correlationId: 'corr-camel-search',
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_progress',
      payload: expect.objectContaining({
        requestId: null,
        correlationId: null,
        structuredPayload: expect.objectContaining({
          requestId: 'req-camel-search',
          correlationId: 'corr-camel-search',
        }),
      }),
    });
  });

  test('native web search progress is rehydrated as one synthetic web_search tool pair', () => {
    const firstProgress = event('tool_progress', {
      text: 'Searching web',
      toolName: 'web_search',
      requestId: 'req-search-1',
      correlationId: 'corr-search-1',
      query: 'project docs',
    });
    const secondProgress = event('tool_progress', {
      text: 'Searched example.com',
      toolName: 'web_search',
      requestId: 'req-search-1',
      correlationId: 'corr-search-1',
      query: 'project docs',
      url: 'https://example.com/docs',
    });

    expect(buildDisplayConversation([firstProgress, secondProgress]).messages).toEqual([
      expect.objectContaining({
        sender: 'assistant',
        text: 'Searching web',
        messageType: 'tool_progress',
        toolName: 'web_search',
        requestId: 'req-search-1',
        correlationId: 'corr-search-1',
      }),
      expect.objectContaining({
        sender: 'assistant',
        text: 'Searched example.com',
        messageType: 'tool_progress',
        toolName: 'web_search',
        requestId: 'req-search-1',
        correlationId: 'corr-search-1',
      }),
    ]);
    expect(buildDisplayRows([firstProgress, secondProgress])).toEqual([
      expect.objectContaining({
        role: 'assistant',
        type: 'tool_progress',
        content: 'Searching web',
        metadata: expect.objectContaining({
          toolName: 'web_search',
          requestId: 'req-search-1',
          correlationId: 'corr-search-1',
          displayCorrelationId: 'req-search-1',
        }),
      }),
      expect.objectContaining({
        role: 'assistant',
        type: 'tool_progress',
        content: 'Searched example.com',
        metadata: expect.objectContaining({
          toolName: 'web_search',
          requestId: 'req-search-1',
          correlationId: 'corr-search-1',
          displayCorrelationId: 'req-search-1',
        }),
      }),
    ]);
    expect(buildRehydrateSnapshot([firstProgress, secondProgress]).messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
        content: '',
        tool_call_id: 'native-web-search:turn-1:req-search-1',
        tool_calls: [
          {
            id: 'native-web-search:turn-1:req-search-1',
            name: 'web_search',
            arguments: {
              query: 'project docs',
              count: 2,
            },
          },
        ],
      }),
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
        tool_name: 'web_search',
        tool_call_id: 'native-web-search:turn-1:req-search-1',
        content: [
          'Native web_search activity:',
          '- Searching web',
          '- Searched example.com',
        ].join('\n'),
        structured_payload: expect.objectContaining({
          synthetic_native_web_search: true,
          progress_events: [
            expect.objectContaining({ text: 'Searching web' }),
            expect.objectContaining({ text: 'Searched example.com' }),
          ],
        }),
      }),
    ]);
  });

  test('native web search progress does not synthesize duplicate history when a real web_search pair exists', () => {
    const events = [
      event('tool_call', {
        toolName: 'web_search',
        requestId: 'req-search-real',
        toolCallId: 'call-search-real',
        tool_calls: [{
          id: 'call-search-real',
          name: 'web_search',
          arguments: { query: 'project docs' },
        }],
      }),
      event('tool_progress', {
        text: 'Searched example.com',
        toolName: 'web_search',
        requestId: 'req-search-real',
        correlationId: 'req-search-real',
      }),
      event('tool_output', {
        toolName: 'web_search',
        requestId: 'req-search-real',
        toolCallId: 'call-search-real',
        output: 'real web search output',
      }),
    ];

    const rehydrateMessages = buildRehydrateSnapshot(events).messages;

    expect(rehydrateMessages.filter(message => message.role === 'assistant')).toHaveLength(1);
    expect(rehydrateMessages.filter(message => message.role === 'tool')).toHaveLength(1);
    expect(rehydrateMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
        tool_call_id: 'call-search-real',
      }),
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
        tool_call_id: 'call-search-real',
        content: 'real web search output',
      }),
    ]);
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
      payload: {
        final_response: 'final assistant answer',
        model_id: 'gpt-normalized',
        model_provider: 'openai',
      },
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
        modelId: 'gpt-normalized',
        modelProvider: 'openai',
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
        message_type: 'assistant_response',
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

    expect(buildDisplayRows([normalized]).at(0)?.metadata).toEqual(expect.objectContaining({
      screenshotRef: 'artifact-local',
      screenshotUrl: '/api/artifacts/artifact-local',
      screenshotRefs: ['artifact-local', 'artifact-local-2'],
    }));
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
        metadata: { skip_local_execution: true },
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_call',
      payload: expect.objectContaining({
        toolName: 'browser',
        requestId: 'req-invalid-browser',
        metadata: { skip_local_execution: true },
      }),
    });
  });

  test('backend tool-output normalization exposes renderer identity and attachment fields', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-output',
      event_id: 'backend-tool-output-alias',
      sequence: 1,
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
        screenshot_url: '/api/artifacts/artifact-shot',
        screenshot_content_type: 'image/png',
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
        attachments: [
          expect.objectContaining({
            id: `${normalized?.eventId}:attachment:000`,
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            contentType: 'image/png',
            screenshotRef: 'artifact-shot',
            screenshotUrl: '/api/artifacts/artifact-shot',
          }),
        ],
        userId: 'user-sdk-runtime',
      }),
    });
  });

  test('backend tool-output normalization exposes typed display attachments directly', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'tool-output',
      event_id: 'backend-tool-output-typed',
      sequence: 1,
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-output',
      payload: {
        tool_name: 'screenshot',
        request_id: 'req-output',
        output: 'captured',
        display_attachments: [
          {
            id: 'typed-attach-1',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshot_ref: 'artifact-typed-1',
            screenshot_url: '/api/artifacts/artifact-typed-1',
            content_type: 'image/png',
            previewSrc: 'data:image/png;base64,should-not-cross',
          },
          {
            id: 'typed-attach-2',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshot_ref: 'artifact-typed-2',
            screenshot_url: 'data:image/png;base64,should-not-cross',
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      type: 'tool_output',
      payload: expect.objectContaining({
        attachments: [
          {
            id: 'typed-attach-1',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            contentType: 'image/png',
            screenshotRef: 'artifact-typed-1',
            screenshotUrl: '/api/artifacts/artifact-typed-1',
          },
          {
            id: 'typed-attach-2',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-typed-2',
          },
        ],
      }),
    });
    expect(normalized?.payload.attachments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ previewSrc: expect.anything() }),
    ]));
    expect(JSON.stringify(normalized?.payload.attachments)).not.toContain('data:image');
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
            tool_call_id: 'call-read-file',
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
            toolCallId: 'call-read-file',
          }),
        ],
        structuredPayload: expect.objectContaining({
          tools: [
            expect.objectContaining({
              tool_call_id: 'call-read-file',
            }),
          ],
        }),
      }),
    });
  });

  test('backend trace-event normalization creates sanitized hidden trace rows from backend schema fields', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'trace-event',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-provider-trace',
      payload: {
        traceId: 'trace-provider-1',
        spanId: 'span-provider-1',
        path: 'provider.call',
        stage: 'completion',
        status: 'succeeded',
        runtime: 'provider',
        requestId: 'req-provider-1',
        durationMs: 42,
        data: {
          provider: 'openai',
          modelId: 'gpt-test',
          promptTokens: 123,
          providerPayload: { raw: 'must not persist' },
          apiKey: 'sk-secret',
          text: 'raw prompt text',
        },
      },
    });

    expect(normalized).toMatchObject({
      type: 'trace_event',
      source: 'backend',
      turnRef: 'turn-provider-trace',
      payload: expect.objectContaining({
        schemaVersion: 1,
        traceId: 'trace-provider-1',
        spanId: 'span-provider-1',
        path: 'provider.call',
        stage: 'completion',
        status: 'succeeded',
        runtime: 'provider',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-provider-trace',
        userId: 'user-sdk-runtime',
        requestId: 'req-provider-1',
        durationMs: 42,
        data: expect.objectContaining({
          provider: 'openai',
          modelId: 'gpt-test',
          promptTokens: 123,
          providerPayload: '[redacted]',
          apiKey: '[redacted]',
          text: '[redacted]',
        }),
      }),
    });
    expect(buildDisplayConversation([normalized as ConversationEvent]).messages).toEqual([]);
    expect(buildRehydrateSnapshot([normalized as ConversationEvent]).messages).toEqual([]);
    expect(buildTraceTimeline([normalized as ConversationEvent], {
      path: 'provider.call',
      turnRef: 'turn-provider-trace',
    })).toEqual([
      expect.objectContaining({
        eventId: normalized?.eventId,
        path: 'provider.call',
        runtime: 'provider',
      }),
    ]);
  });

  test('backend model-history-updated normalization creates hidden checkpoint rows', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'model-history-updated',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-model-history',
      payload: {
        revision_id: 'rev-model-history',
        checkpoint_id: 'mh-rev-model-history-turn',
        created_at: '2026-06-22T12:00:00.000Z',
        rows: [
          {
            id: 'mh-row-tool',
            conversation_ref: 'conv-sdk-runtime',
            revision_id: 'rev-model-history',
            role: 'tool',
            message_type: 'tool_output',
            content: 'bounded output',
            tool_call_id: 'call-1',
            tool_name: 'read_file',
            image_refs: ['artifact-1'],
            source_display_row_ids: ['display-tool'],
          },
        ],
      },
    });

    expect(normalized).toMatchObject({
      type: 'model_history_updated',
      source: 'backend',
      revisionId: 'rev-model-history',
      payload: expect.objectContaining({
        checkpointId: 'mh-rev-model-history-turn',
        rows: [
          expect.objectContaining({
            id: 'mh-row-tool',
            messageType: 'tool_output',
            content: 'bounded output',
            toolCallId: 'call-1',
            imageRefs: ['artifact-1'],
          }),
        ],
      }),
    });
    expect(buildDisplayConversation([normalized as ConversationEvent]).messages).toEqual([]);
    expect(buildRehydrateSnapshot([normalized as ConversationEvent]).messages).toEqual([]);
  });

  test('backend trace-event normalization ignores removed snake_case trace payload aliases', () => {
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'trace-event',
      conversation_ref: 'conv-sdk-runtime',
      user_id: 'user-sdk-runtime',
      turn_ref: 'turn-provider-trace',
      payload: {
        trace_id: 'trace-snake',
        span_id: 'span-snake',
        parent_span_id: 'span-parent-snake',
        conversation_ref: 'conv-payload-snake',
        turn_ref: 'turn-payload-snake',
        user_id: 'user-payload-snake',
        request_id: 'req-snake',
        started_at: '2026-06-18T00:00:00.000Z',
        ended_at: '2026-06-18T00:00:01.000Z',
        duration_ms: 42,
        path: 'provider.call',
        stage: 'completion',
        status: 'succeeded',
        runtime: 'provider',
      },
    });

    expect(normalized).toMatchObject({
      type: 'trace_event',
      source: 'backend',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-provider-trace',
      payload: expect.objectContaining({
        traceId: expect.stringMatching(/^trace_/),
        spanId: expect.stringMatching(/^span_/),
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-provider-trace',
        userId: 'user-sdk-runtime',
        requestId: null,
        startedAt: null,
        durationMs: null,
      }),
    });
    expect(normalized?.payload).not.toEqual(expect.objectContaining({
      traceId: 'trace-snake',
      spanId: 'span-snake',
      parentSpanId: 'span-parent-snake',
      endedAt: '2026-06-18T00:00:01.000Z',
    }));
  });

  test('conversation runtime persists backend-origin trace-event rows from transport', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    const emitted: ConversationEvent[] = [];
    runtime.subscribeEvents(event => emitted.push(event));
    runtime.attachTransport();

    transport.emit({
      type: 'trace-event',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-backend-stream-trace',
      user_id: 'user-sdk-runtime',
      payload: {
        traceId: 'trace-stream-1',
        spanId: 'span-stream-1',
        path: 'backend.stream',
        stage: 'terminal_event',
        status: 'succeeded',
        runtime: 'backend',
        durationMs: 18,
        data: {
          terminalEventType: 'streaming-complete',
          eventCount: 7,
          token: 'secret-token',
          content: 'final answer text',
        },
      },
    });

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.some(event => event.type === 'trace_event')).toBe(true);
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    const timeline = buildTraceTimeline(events, {
      path: 'backend.stream',
      turnRef: 'turn-backend-stream-trace',
    });
    expect(timeline).toEqual([
      expect.objectContaining({
        traceId: 'trace-stream-1',
        spanId: 'span-stream-1',
        path: 'backend.stream',
        stage: 'terminal_event',
        status: 'succeeded',
        runtime: 'backend',
        data: expect.objectContaining({
          terminalEventType: 'streaming-complete',
          eventCount: 7,
          token: '[redacted]',
          content: '[redacted]',
        }),
      }),
    ]);
    expect(emitted.some(event => event.type === 'trace_event')).toBe(true);
    expect(buildDisplayConversation(events).messages).toEqual([]);
    expect(buildRehydrateSnapshot(events).messages).toEqual([]);
  });

  test('conversation runtime persists backend model-history checkpoints from transport', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      store,
      transport,
    });
    runtime.attachTransport();

    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-model-history',
      checkpoint_id: 'mh-rev-model-history-turn',
      created_at: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-row-assistant',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'assistant',
          message_type: 'assistant_response',
          content: 'hello',
          source_display_row_ids: ['display-assistant'],
        },
      ],
    }, {
      eventId: 'turn-model-history-evt-000001-model-history-updated',
      turnRef: 'turn-model-history',
    }));

    await waitForExpect(async () => {
      await expect(store.loadModelHistory({
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-model-history',
      })).resolves.toEqual({
        checkpointId: 'mh-rev-model-history-turn',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-model-history',
        createdAt: '2026-06-22T12:00:00.000Z',
        rows: [
          expect.objectContaining({
            id: 'mh-row-assistant',
            role: 'assistant',
            messageType: 'assistant_response',
            content: 'hello',
          }),
        ],
      });
    });
    expect(buildDisplayConversation(await store.loadEvents('conv-sdk-runtime')).messages).toEqual([]);
  });

  test('conversation runtime marks compaction model-history checkpoints as compact revisions', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-compact-history',
      store,
      transport,
    });
    runtime.attachTransport();

    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-compact-history',
      checkpoint_id: 'mh-rev-compact-history',
      created_at: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-row-compaction',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-compact-history',
          role: 'assistant',
          message_type: 'context_compaction',
          content: 'bounded summary',
        },
      ],
    }, {
      eventId: 'compact-evt-000003-model-history-updated',
      turnRef: 'compact-op',
    }));

    await waitForExpect(async () => {
      await expect(store.getRevision('conv-sdk-runtime')).resolves.toMatchObject({
        revisionId: 'rev-compact-history',
        operation: 'compact',
        modelHistoryCheckpointId: 'mh-rev-compact-history',
      });
    });
  });

  test('conversation runtime records overlay phase projection traces for backend turn events', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      memoryEnabled: false,
    });
    runtime.attachTransport();

    transport.emit(backendEvent('query-accepted', {}, {
      eventId: 'turn-overlay-evt-000001-query-accepted',
      turnRef: 'turn-overlay',
      sequence: 1,
    }));
    transport.emit(backendEvent('streaming-complete', { final_response: 'overlay answer text' }, {
      eventId: 'turn-overlay-evt-000002-streaming-complete',
      turnRef: 'turn-overlay',
      sequence: 2,
    }));

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.some(event => event.type === 'turn_completed')).toBe(true);
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-overlay',
      path: 'overlay.phase',
    });
    expect(timeline.map(entry => `${entry.data?.sourceEventType}:${entry.data?.phaseBefore}->${entry.data?.phaseAfter}`)).toEqual([
      'turn_started:idle->sending',
      'turn_completed:sending->completed',
    ]);
    expect(JSON.stringify(timeline)).not.toContain('overlay answer text');
  });

  test('backend compaction-completed only normalizes to applied when replacement history exists', () => {
    const previousDebugCompactionStdout = process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    process.env.AGENT_DEBUG_COMPACTION_STDOUT = '1';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
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

    expect(logSpy).toHaveBeenCalledWith(
      '[Agent SDK][Compaction] backend event normalized',
      expect.objectContaining({
        backendEventType: 'context-compaction-completed',
        normalizedEventType: 'compaction_applied',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
        generationId: 'gen-applied',
        replacementHistoryEntryCount: 1,
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[Agent SDK][Compaction] backend event normalized',
      expect.objectContaining({
        backendEventType: 'context-compaction-completed',
        normalizedEventType: 'compaction_skipped',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-1',
        replacementHistoryEntryCount: 0,
      }),
    );
    expect(logSpy.mock.calls[0][1]).not.toHaveProperty('summaryText');
    logSpy.mockRestore();
    if (previousDebugCompactionStdout === undefined) {
      delete process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    } else {
      process.env.AGENT_DEBUG_COMPACTION_STDOUT = previousDebugCompactionStdout;
    }

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

  test('backend compaction normalization ignores camelCase generation aliases', () => {
    const previousDebugCompactionStdout = process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    process.env.AGENT_DEBUG_COMPACTION_STDOUT = '1';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const normalized = normalizeBackendEventToConversationEvent({
      type: 'context-compaction-completed',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-compact',
      payload: {
        generationId: 'gen-camel',
        skippedReason: 'camel-skip',
        replacement_history_entries: [
          { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
        ],
      },
    });

    expect(normalized).toMatchObject({
      type: 'compaction_applied',
      payload: expect.objectContaining({
        compactionRef: 'turn-compact',
        generationId: null,
        skippedReason: null,
      }),
    });
    expect(logSpy).toHaveBeenCalledWith(
      '[Agent SDK][Compaction] backend event normalized',
      expect.objectContaining({
        generationId: null,
        skippedReason: null,
      }),
    );
    logSpy.mockRestore();
    if (previousDebugCompactionStdout === undefined) {
      delete process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    } else {
      process.env.AGENT_DEBUG_COMPACTION_STDOUT = previousDebugCompactionStdout;
    }
  });

  test('manual compaction operation events are accepted outside the active turn and persist replay', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    runtime.attachTransport();

    await runtime.send({
      text: 'keep working while compaction runs',
      turnRef: 'turn-live',
    });
    transport.emit(backendEvent('context-compaction-started', {
      reason: 'manual',
      before_tokens: 29551,
    }, {
      eventId: 'compact-op-evt-000001-context-compaction-started',
      turnRef: 'compact-op',
      sequence: 1,
    }));
    transport.emit(backendEvent('context-compaction-completed', {
      generation_id: 'gen-manual',
      reason: 'manual',
      before_tokens: 29551,
      after_tokens: 8209,
      removed_messages: 44,
      summary_preview: 'Manual compaction summary.',
      replacement_history_entries: [
        {
          role: 'assistant',
          content: 'Manual compaction summary.',
          message_type: 'context_compaction',
        },
      ],
      skipped_reason: null,
    }, {
      eventId: 'compact-op-evt-000002-context-compaction-completed',
      turnRef: 'compact-op',
      sequence: 2,
    }));
    transport.emit(backendEvent('context-compaction-completed', {
      generation_id: 'gen-manual',
      replacement_history_entries: [
        {
          role: 'assistant',
          content: 'Manual compaction summary.',
          message_type: 'context_compaction',
        },
      ],
      skipped_reason: null,
    }, {
      eventId: 'compact-op-evt-000002-context-compaction-completed',
      turnRef: 'compact-op',
      sequence: 2,
    }));

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.filter(storedEvent => storedEvent.type === 'compaction_applied')).toHaveLength(1);
    });

    const snapshot = await runtime.load();
    const events = await store.loadEvents('conv-sdk-runtime');
    const applied = events.find(storedEvent => storedEvent.type === 'compaction_applied');
    expect(snapshot.state.activeTurnRef).toBe('turn-live');
    expect(snapshot.state.compaction).toMatchObject({
      status: 'applied',
      generationId: 'gen-manual',
    });
    expect(applied).toMatchObject({
      eventId: 'compact-op-evt-000002-context-compaction-completed',
      turnRef: 'compact-op',
      payload: expect.objectContaining({
        operationRef: 'compact-op',
        compactionRef: 'gen-manual',
        entries: [
          expect.objectContaining({
            content: 'Manual compaction summary.',
          }),
        ],
        entryCount: 1,
        complete: true,
        active: true,
      }),
    });
    await expect(store.loadForRehydrate('conv-sdk-runtime')).resolves.toMatchObject({
      replayGenerationId: 'gen-manual',
      messages: [
        expect.objectContaining({
          content: 'Manual compaction summary.',
        }),
      ],
    });
    logSpy.mockRestore();
  });

  test('stale turn-stream backend events still fail the active turn gate', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    runtime.attachTransport();

    await runtime.send({
      text: 'active turn',
      turnRef: 'turn-live',
    });
    transport.emit(backendEvent('assistant-message-full', {
      content: 'stale assistant text',
    }, {
      eventId: 'stale-turn-evt-000001-assistant-message-full',
      turnRef: 'stale-turn',
      sequence: 1,
    }));

    await tick();

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).not.toContain(
      'stale-turn-evt-000001-assistant-message-full',
    );
    expect((await runtime.load()).state.activeTurnRef).toBe('turn-live');
  });

  test('late old-turn stop cannot make edit resend drop new backend events', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    runtime.attachTransport();

    await runtime.send({
      text: 'original turn',
      turnRef: 'turn-old',
    });
    await runtime.send({
      text: 'edited resend',
      turnRef: 'turn-new',
    });
    await runtime.stop('turn-old');

    transport.emit(backendEvent('assistant-message-full', {
      content: 'new turn assistant text',
    }, {
      eventId: 'turn-new-evt-000001-assistant-message-full',
      turnRef: 'turn-new',
      sequence: 1,
    }));

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.map(storedEvent => storedEvent.eventId)).toContain(
        'turn-new-evt-000001-assistant-message-full',
      );
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect((await runtime.load()).state.activeTurnRef).toBe('turn-new');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventId: 'turn-new-evt-000001-assistant-message-full',
        type: 'assistant_message',
        turnRef: 'turn-new',
      }),
    ]));
    expect(events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'trace_event',
        payload: expect.objectContaining({
          path: 'backend.event.reject',
          data: expect.objectContaining({
            sourceEventId: 'turn-new-evt-000001-assistant-message-full',
          }),
        }),
      }),
    ]));
  });

  test('tool coordinator returns explicit failed result for claimed tool execution failure', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: {
        executeTool: jest.fn(async () => {
          throw new Error('local runtime unavailable');
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
        output: 'local runtime unavailable',
      },
    }));
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        eventId: 'turn-1-local-tool-output-req-read',
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-read',
          toolCallId: null,
          correlationId: null,
          success: false,
          error: 'local runtime unavailable',
        }),
      }),
    ]);
  });

  test('tool coordinator fails stale local routes before local execution', async () => {
    const store = new InMemoryConversationStore();
    const executeTool = jest.fn(async () => ({ success: true, data: { output: 'ran' } }));
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      agentDefinition: {
        tools: {
          client_manifest: {
            version: 1,
            tools: [{ name: 'read_file', schema: { type: 'object' } }],
          },
        },
      },
      localRuntime: { executeTool },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    const claim = await coordinator.execute(event('tool_call', {
      toolName: 'cua_driver__get_open_windows',
      requestId: 'req-stale-cua',
      args: {},
    }));

    expect(claim.claimed).toBe(true);
    expect(executeTool).not.toHaveBeenCalled();
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-stale-cua',
      success: false,
      data: {
        output: expect.stringContaining('active capability manifest no longer exposes this tool'),
      },
    }));
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
      metadata: { skip_local_execution: true },
    }));

    expect(claim).toEqual({ claimed: true, reason: 'backend-skipped-local-execution' });
    expect(executeTool).not.toHaveBeenCalled();
    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([]);
  });

  test('tool coordinator rejects direct snake_case SDK tool event payloads', async () => {
    const executeTool = jest.fn(async () => ({
      success: true,
      data: {
        output: 'should not run',
      },
    }));
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: {
        executeTool,
      },
      sendToolResult: jest.fn(async () => undefined),
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    expect(coordinator.canClaim(event('tool_call', {
      tool_name: 'read_file',
      request_id: 'req-snake',
      args: { path: 'README.md' },
    }))).toEqual({
      claimed: false,
      reason: 'missing-tool-name-or-request-id',
    });
    expect(coordinator.canClaim(event('tool_bundle_call', {
      bundle_id: 'bundle-snake',
      tools: [
        { name: 'read_file', args: { path: 'README.md' } },
      ],
    }))).toEqual({
      claimed: false,
      reason: 'missing-bundle-id-or-tools',
    });

    await expect(coordinator.execute(event('tool_call', {
      tool_name: 'read_file',
      request_id: 'req-snake',
      args: { path: 'README.md' },
    }))).resolves.toEqual({
      claimed: false,
      reason: 'missing-tool-name-or-request-id',
    });
    expect(executeTool).not.toHaveBeenCalled();
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
          throw new Error('local runtime failed');
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

  test('tool coordinator persists read_file image results as artifact-backed attachments', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => ({
        artifact_id: 'read-file-image.png',
        content_type: 'image/png',
        size_bytes: 15,
        sha256: 'sha-read-file-image',
        url: '/api/artifacts/read-file-image.png',
      })),
    });
    const coordinator = new ToolExecutionCoordinator({
      store,
      artifactUploader,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Image file loaded (image/png, 15 bytes).',
            file_path: '/tmp/browser-screenshot.png',
            image_data: INLINE_JPEG_BASE64,
            image_content_type: 'image/png',
            image_size_bytes: 15,
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await coordinator.execute(event('tool_call', {
      toolName: 'read_file',
      requestId: 'req-read-image',
      toolCallId: 'call-read-image',
      args: { file_path: '/tmp/browser-screenshot.png' },
    }));

    expect(artifactUploader.upload).toHaveBeenCalledTimes(1);
    expect(sendToolResult).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-read-image',
      success: true,
      data: expect.objectContaining({
        output: 'Image file loaded (image/png, 15 bytes).',
        file_path: '/tmp/browser-screenshot.png',
        image_size_bytes: 15,
        screenshot_ref: 'read-file-image.png',
        screenshot_url: '/api/artifacts/read-file-image.png',
        screenshot_content_type: 'image/png',
        display_attachments: [{
          id: 'req-read-image:attachment:000',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          content_type: 'image/png',
          screenshot_ref: 'read-file-image.png',
          screenshot_url: '/api/artifacts/read-file-image.png',
        }],
      }),
    }));
    expect(sendToolResult.mock.calls[0][0].data).not.toHaveProperty('image_data');
    expect(sendToolResult.mock.calls[0][0].data).not.toHaveProperty('screenshot');

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'tool_output',
      payload: expect.objectContaining({
        requestId: 'req-read-image',
        toolCallId: 'call-read-image',
        toolName: 'read_file',
        screenshot_ref: 'read-file-image.png',
        screenshot_url: '/api/artifacts/read-file-image.png',
        screenshot_content_type: 'image/png',
        attachments: [{
          id: 'req-read-image:attachment:000',
          kind: 'image',
          source: 'tool_result',
          status: 'ready',
          contentType: 'image/png',
          screenshotRef: 'read-file-image.png',
          screenshotUrl: '/api/artifacts/read-file-image.png',
        }],
      }),
    }));
    expect(events[0]?.payload.result).not.toHaveProperty('image_data');
    expect(events[0]?.payload.result).not.toHaveProperty('screenshot');

    const rows = buildDisplayRows(events);
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        metadata: expect.objectContaining({
          attachments: [{
            id: 'req-read-image:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            contentType: 'image/png',
            screenshotRef: 'read-file-image.png',
            screenshotUrl: '/api/artifacts/read-file-image.png',
          }],
        }),
      }),
    ]);
  });

  test('tool coordinator rejects camelCase screenshot aliases before artifact materialization', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      artifactUploader: createMockArtifactUploader(),
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshot: INLINE_JPEG_BASE64,
            screenshotRef: 'legacy-shot.jpg',
            screenshotUrl: '/api/artifacts/legacy-shot.jpg',
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await expect(coordinator.execute(event('tool_call', {
      toolName: 'screenshot',
      requestId: 'req-camel-shot',
      args: { explanation: 'Capture screen' },
    }))).rejects.toThrow(
      'Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.',
    );

    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-camel-shot',
          success: false,
          deliveryFailed: true,
          error: expect.stringContaining('camelCase screenshot fields are not supported'),
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

  test('tool coordinator rejects camelCase-only screenshot result aliases', async () => {
    const store = new InMemoryConversationStore();
    const sendToolResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            output: 'Screenshot captured successfully.',
            screenshotRef: 'legacy-shot',
            screenshotUrl: '/api/artifacts/legacy-shot',
          },
        })),
      },
      sendToolResult,
      sendToolBundleResult: jest.fn(async () => undefined),
    });

    await expect(coordinator.execute(event('tool_call', {
      toolName: 'screenshot',
      requestId: 'req-camel-shot',
      args: { explanation: 'Capture screen' },
    }))).rejects.toThrow(
      'Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.',
    );

    expect(sendToolResult).not.toHaveBeenCalled();
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          requestId: 'req-camel-shot',
          success: false,
          deliveryFailed: true,
          error: expect.stringContaining(
            'Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.',
          ),
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
    const store = new InMemoryConversationStore();
    const sendToolBundleResult = jest.fn(async () => undefined);
    const coordinator = new ToolExecutionCoordinator({
      store,
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
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual([
      expect.objectContaining({
        eventId: 'turn-1-local-tool-bundle-output-bundle-read',
        type: 'tool_bundle_output',
        payload: expect.objectContaining({
          bundleId: 'bundle-read',
          status: 'partial_failure',
        }),
      }),
    ]);
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

  test('conversation runtime emits base user row before slow enrichment and transport', async () => {
    let releaseEnrichment: (() => void) | null = null;
    const enrichmentGate = new Promise<void>(resolve => {
      releaseEnrichment = resolve;
    });
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-after-enrichment'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      enrichQuery: async () => {
        await enrichmentGate;
        return {
          content: '<user_query>hello</user_query>',
          screenshotRef: 'artifact-1',
        };
      },
    });
    const events: ConversationEvent[] = [];
    const snapshots: any[] = [];
    runtime.subscribeEvents((event, snapshot) => {
      events.push(event);
      snapshots.push(snapshot);
    });

    const sendPromise = runtime.send({ text: 'hello', turnRef: 'turn-slow-enrich' });

    await waitForExpect(() => {
      expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
        'turn_started',
        'user_message',
      ]);
      expect(transport.sendQuery).not.toHaveBeenCalled();
      expect(snapshots.at(-1).displayRows).toEqual([
        expect.objectContaining({
          type: 'user_message',
          content: 'hello',
          turnRef: 'turn-slow-enrich',
        }),
      ]);
      expect(snapshots.at(-1).currentTurn.presentation).toMatchObject({
        typingVisible: true,
        overlayVisible: true,
        overlayIntent: expect.objectContaining({
          visible: true,
          mode: 'awaiting',
          staleGuardRef: 'turn-slow-enrich',
        }),
      });
    });

    releaseEnrichment?.();
    await sendPromise;

    await waitForExpect(() => {
      expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
        'turn_started',
        'user_message',
        'user_message_metadata',
      ]);
      expect(transport.sendQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'hello',
          conversation_ref: 'conv-sdk-runtime',
          screenshotRef: 'artifact-1',
        }),
        { messageId: 'turn-slow-enrich' },
      );
    });
  });

  test('conversation runtime keeps live-turn presentation stable during slow resource resolution', async () => {
    let releaseResolver: (() => void) | null = null;
    const resolverGate = new Promise<void>(resolve => {
      releaseResolver = resolve;
    });
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-after-resources'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      resourceResolvers: {
        readable_file: async (resource) => {
          await resolverGate;
          return {
            kind: resource.kind,
            attachmentContext: '--- Attached File: notes.txt ---\nhello from file',
            attachmentFilenames: ['notes.txt'],
          };
        },
      },
      enrichQuery: async ({ payload }) => payload ?? {},
    });
    const events: ConversationEvent[] = [];
    const snapshots: any[] = [];
    runtime.subscribeEvents((event, snapshot) => {
      events.push(event);
      snapshots.push(snapshot);
    });

    const sendPromise = runtime.send({
      text: 'summarize this',
      turnRef: 'turn-slow-resource',
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      metadata: {
        attachmentFilenames: ['notes.txt'],
      },
    });

    await waitForExpect(() => {
      expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
        'turn_started',
        'user_message',
      ]);
      expect(transport.sendQuery).not.toHaveBeenCalled();
      const snapshot = snapshots.at(-1);
      expect(snapshot.currentTurn.userMessageRowId).toBeTruthy();
      expect(snapshot.currentTurn.presentation).toMatchObject({
        typingVisible: true,
        overlayVisible: true,
        awaitingAnchor: expect.objectContaining({
          rowId: snapshot.currentTurn.userMessageRowId,
          turnRef: 'turn-slow-resource',
        }),
        overlayIntent: expect.objectContaining({
          visible: true,
          mode: 'awaiting',
          staleGuardRef: 'turn-slow-resource',
        }),
      });
      expect(snapshot.displayRows).toEqual([
        expect.objectContaining({
          id: snapshot.currentTurn.userMessageRowId,
          type: 'user_message',
          content: 'summarize this',
          turnRef: 'turn-slow-resource',
        }),
      ]);
    });

    releaseResolver?.();
    await sendPromise;

    await waitForExpect(() => {
      expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
        'turn_started',
        'user_message',
        'user_message_metadata',
      ]);
      expect(transport.sendQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'summarize this',
          conversation_ref: 'conv-sdk-runtime',
          attachment_context: '--- Attached File: notes.txt ---\nhello from file',
          attachment_filenames: ['notes.txt'],
        }),
        { messageId: 'turn-slow-resource' },
      );
    });
  });

  test('default turn resource resolver uses main-materialized screenshot refs before backend send', async () => {
    const artifactUploader = createMockArtifactUploader({
      upload: jest.fn(async () => ({
        artifact_id: 'unused-query-shot.jpg',
        content_type: 'image/jpeg',
        size_bytes: 4,
        sha256: 'sha-query-shot',
        url: '/api/artifacts/unused-query-shot.jpg',
      })),
    });
    const executeTool = jest.fn(async () => ({
      success: true,
      data: {
        output: 'Screenshot captured successfully.',
        screenshot_ref: 'artifact-query-shot.jpg',
        screenshot_url: '/api/artifacts/artifact-query-shot.jpg',
        screenshot_content_type: 'image/jpeg',
        capture_meta: {
          source_w: 1920,
          source_h: 1080,
          crop_x: 0,
          crop_y: 0,
          crop_w: 1920,
          crop_h: 1080,
          timestamp: 123,
          capture_engine: 'pyautogui_fallback',
        },
      },
    }));
    const releaseScreenshotLease = jest.fn(async () => undefined) as jest.Mock & {
      trace?: Record<string, unknown>;
    };
    releaseScreenshotLease.trace = {
      platform: 'darwin',
      leaseMode: 'content_protection',
      visibleCaptureWindowCount: 2,
      durationMs: 4,
    };
    const localToolLifecycle = {
      beforeExecute: jest.fn(async () => releaseScreenshotLease),
    };
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-after-screenshot-resource'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      sdkClient: {
        artifacts: artifactUploader,
      } as any,
      localRuntime: {
        executeTool,
      },
      resourceResolvers: createDefaultTurnResourceResolvers({
        sdkClient: {
          artifacts: artifactUploader,
        } as any,
        localRuntime: {
          executeTool,
        },
        localToolLifecycle,
      }),
      enrichQuery: async ({ payload }) => payload ?? {},
    });
    const events: ConversationEvent[] = [];
    runtime.subscribeEvents((event) => {
      events.push(event);
    });

    await runtime.send({
      text: 'what is on screen?',
      turnRef: 'turn-query-shot',
      resources: [{
        kind: 'query_screenshot_request',
        reason: 'query_send_with_capture',
        required: false,
      }],
    });

    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'screenshot',
      args: expect.objectContaining({
        explanation: 'query_send_with_capture',
        expectation: 'Current screen state',
      }),
    }));
    expect(localToolLifecycle.beforeExecute).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'screenshot',
      turnRef: 'turn-query-shot',
      conversationRef: 'conv-sdk-runtime',
    }));
    expect(releaseScreenshotLease).toHaveBeenCalledTimes(1);
    expect(artifactUploader.upload).not.toHaveBeenCalled();
    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'what is on screen?',
        conversation_ref: 'conv-sdk-runtime',
        screenshot_ref: 'artifact-query-shot.jpg',
        screenshot_url: '/api/artifacts/artifact-query-shot.jpg',
        screenshot_refs: ['artifact-query-shot.jpg'],
        capture_meta: expect.objectContaining({
          source_w: 1920,
          source_h: 1080,
        }),
      }),
      { messageId: 'turn-query-shot' },
    );
    expect(events.find(event => event.type === 'user_message_metadata')?.payload).toEqual(
      expect.objectContaining({
        screenshotRef: 'artifact-query-shot.jpg',
        screenshot_ref: 'artifact-query-shot.jpg',
      }),
    );
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-query-shot',
      path: 'screenshot.capture',
    });
    expect(timeline.map(entry => `${entry.runtime}:${entry.stage}:${entry.status}`)).toEqual([
      'sdk:resource_detected:succeeded',
      'sdk:resolver:started',
      'electron-main:surface_prepare:started',
      'electron-main:surface_prepare:succeeded',
      'local-runtime:local_runtime_capture:started',
      'local-runtime:local_runtime_capture:succeeded',
      'sdk:artifact_upload:skipped',
      'sdk:resolver:succeeded',
      'sdk:query_payload_applied:succeeded',
    ]);
    expect(timeline.find(entry => entry.stage === 'surface_prepare' && entry.status === 'succeeded')?.data).toEqual(
      expect.objectContaining({
        platform: 'darwin',
        leaseMode: 'content_protection',
        visibleCaptureWindowCount: 2,
      }),
    );
    expect(timeline.find(entry => entry.stage === 'local_runtime_capture' && entry.status === 'succeeded')?.data).toEqual(
      expect.objectContaining({
        captureEngine: expect.any(String),
        sourceW: 1920,
        sourceH: 1080,
        hasCaptureMeta: true,
      }),
    );
    expect(timeline.find(entry => entry.stage === 'artifact_upload' && entry.status === 'succeeded')?.data).toEqual(
      undefined,
    );
    const artifactTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-query-shot',
      path: 'artifact.upload',
    });
    expect(artifactTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'upload:skipped',
    ]);
    expect(artifactTimeline[0].data).toEqual(expect.objectContaining({
      reason: 'existing_ref',
      hasScreenshotRef: true,
    }));
    const resourceTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-query-shot',
      path: 'query.resources',
    });
    expect(resourceTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'resolve:started',
      'resolve:succeeded',
    ]);
    expect(resourceTimeline[0].data).toEqual(expect.objectContaining({
      resourceCount: 1,
      resourceKinds: ['query_screenshot_request'],
    }));
    expect(resourceTimeline[1].data).toEqual(expect.objectContaining({
      resourceCount: 1,
      resourceKinds: ['query_screenshot_request'],
      payloadKeyCount: expect.any(Number),
      metadataKeyCount: expect.any(Number),
    }));
    expect(JSON.stringify(timeline)).not.toContain('screenshot_path');
    expect(JSON.stringify(artifactTimeline)).not.toContain('screenshot_path');
    expect(buildDisplayConversation(events).messages.some(message => message.messageType === 'trace_event')).toBe(false);
  });

  test('send persists display-safe visual metadata on the initial user display row', async () => {
    const store = new InMemoryConversationStore();
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-replay-visual'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });
    const displayAttachment = {
      id: 'legacy-ui-attachment',
      kind: 'image',
      source: 'user_included',
      status: 'ready',
      screenshotRef: 'artifact-replay-one',
      filename: 'one.png',
    };

    await runtime.send({
      text: 'review the included image',
      turnRef: 'turn-replay-visual',
      payload: {
        screenshot_refs: ['artifact-replay-one'],
        attachment_filenames: ['one.png'],
      },
      metadata: {
        attachments: [displayAttachment],
      },
    });

    await expect(store.loadDisplayRows('conv-sdk-runtime')).resolves.toEqual([
      expect.objectContaining({
        id: 'turn-replay-visual-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        content: 'review the included image',
        metadata: expect.objectContaining({
          screenshot_refs: ['artifact-replay-one'],
          attachments: [displayAttachment],
          raw: expect.objectContaining({
            screenshot_refs: ['artifact-replay-one'],
            attachment_filenames: ['one.png'],
            attachments: [displayAttachment],
          }),
        }),
      }),
    ]);
  });

  test('default turn resource resolver rejects raw screenshot paths before backend send', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-query-shot-'));
    const screenshotPath = join(tempDir, 'query-shot.jpg');
    await writeFile(screenshotPath, new Uint8Array([1, 2, 3, 4]));
    const artifactUploader = createMockArtifactUploader();
    const executeTool = jest.fn(async () => ({
      success: true,
      data: {
        output: 'Screenshot captured successfully.',
        screenshot_path: screenshotPath,
        screenshot_content_type: 'image/jpeg',
      },
    }));
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-without-path-shot'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      sdkClient: {
        artifacts: artifactUploader,
      } as any,
      localRuntime: {
        executeTool,
      },
      resourceResolvers: createDefaultTurnResourceResolvers({
        sdkClient: {
          artifacts: artifactUploader,
        } as any,
        localRuntime: {
          executeTool,
        },
      }),
      enrichQuery: async ({ payload }) => payload ?? {},
    });
    const events: ConversationEvent[] = [];
    runtime.subscribeEvents((event) => {
      events.push(event);
    });

    try {
      await runtime.send({
        text: 'what is on screen?',
        turnRef: 'turn-query-shot-path-rejected',
        resources: [{
          kind: 'query_screenshot_request',
          reason: 'query_send_with_capture',
          required: false,
        }],
      });

      expect(artifactUploader.upload).not.toHaveBeenCalled();
      await expect(stat(screenshotPath)).resolves.toEqual(expect.objectContaining({
        size: 4,
      }));
      expect(transport.sendQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'what is on screen?',
          conversation_ref: 'conv-sdk-runtime',
        }),
        { messageId: 'turn-query-shot-path-rejected' },
      );
      expect(transport.sendQuery).not.toHaveBeenCalledWith(
        expect.objectContaining({
          screenshot_ref: expect.any(String),
        }),
        expect.anything(),
      );
      const timeline = buildTraceTimeline(events, {
        turnRef: 'turn-query-shot-path-rejected',
        path: 'screenshot.capture',
      });
      expect(timeline.map(entry => `${entry.runtime}:${entry.stage}:${entry.status}`)).toEqual([
        'sdk:resource_detected:succeeded',
        'sdk:resolver:started',
        'local-runtime:local_runtime_capture:started',
        'local-runtime:local_runtime_capture:succeeded',
        'sdk:resolver:skipped',
        'sdk:query_payload_applied:succeeded',
      ]);
      expect(timeline.find(entry => entry.stage === 'resolver' && entry.status === 'skipped')?.data).toEqual(
        expect.objectContaining({
          reason: 'trusted_temp_path_requires_main_materialization',
          optionalFailure: true,
        }),
      );
      expect(JSON.stringify(timeline)).not.toContain(screenshotPath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('query screenshot resource traces optional capture failure while send continues', async () => {
    const executeTool = jest.fn(async () => ({
      success: false,
      error: 'Screen capture permission denied',
    }));
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-without-shot'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      localRuntime: {
        executeTool,
      },
      resourceResolvers: createDefaultTurnResourceResolvers({
        localRuntime: {
          executeTool,
        },
      }),
      enrichQuery: async ({ payload }) => payload ?? {},
    });
    const events: ConversationEvent[] = [];
    runtime.subscribeEvents((event) => {
      events.push(event);
    });

    await runtime.send({
      text: 'what is on screen?',
      turnRef: 'turn-query-shot-failed',
      resources: [{
        kind: 'query_screenshot_request',
        reason: 'query_send_with_capture',
        required: false,
      }],
    });

    expect(transport.sendQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'what is on screen?',
        conversation_ref: 'conv-sdk-runtime',
      }),
      { messageId: 'turn-query-shot-failed' },
    );
    expect(transport.sendQuery).not.toHaveBeenCalledWith(
      expect.objectContaining({
        screenshot_ref: expect.any(String),
      }),
      expect.anything(),
    );
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-query-shot-failed',
      path: 'screenshot.capture',
    });
    expect(timeline.map(entry => `${entry.runtime}:${entry.stage}:${entry.status}`)).toEqual([
      'sdk:resource_detected:succeeded',
      'sdk:resolver:started',
      'local-runtime:local_runtime_capture:started',
      'local-runtime:local_runtime_capture:failed',
      'sdk:resolver:skipped',
      'sdk:query_payload_applied:succeeded',
    ]);
    expect(timeline.find(entry => entry.stage === 'resolver' && entry.status === 'skipped')?.data).toEqual(
      expect.objectContaining({
        optionalFailure: true,
      }),
    );
    expect(timeline.find(entry => entry.stage === 'query_payload_applied')?.data).toEqual(
      expect.objectContaining({
        hasScreenshotRef: false,
        screenshotRefCount: 0,
      }),
    );
  });

  test('conversation runtime records base user row before required resource failure', async () => {
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-unused'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      resourceResolvers: {
        readable_file: async (resource) => ({
          kind: resource.kind,
          error: 'File is not readable',
          fatal: true,
        }),
      },
      enrichQuery: async ({ payload }) => payload ?? {},
    });
    const events: ConversationEvent[] = [];
    const snapshots: any[] = [];
    runtime.subscribeEvents((event, snapshot) => {
      events.push(event);
      snapshots.push(snapshot);
    });

    await expect(runtime.send({
      text: 'summarize failed file',
      turnRef: 'turn-resource-fail',
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/missing.txt',
        filename: 'missing.txt',
        required: true,
      }],
    })).rejects.toThrow('File is not readable');

    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'turn_started',
      'user_message',
      'turn_error',
    ]);
    expect(transport.sendQuery).not.toHaveBeenCalled();
    expect(snapshots.at(1).displayRows).toEqual([
      expect.objectContaining({
        type: 'user_message',
        content: 'summarize failed file',
        turnRef: 'turn-resource-fail',
      }),
    ]);
    expect(snapshots.at(-1).currentTurn).toMatchObject({
      phase: 'error',
      lastError: 'File is not readable',
    });
  });

  test('conversation runtime stores events and skips normal rehydrate without model history', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const sentRehydrates: Record<string, unknown>[] = [];
    const transport = createMockAgentRuntimeTransport({
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
    expect(rehydrate.messages).toEqual([]);
    expect(sentRehydrates).toEqual([]);
    await expect(store.loadForRehydrate('conv-sdk-runtime')).resolves.toMatchObject({
      messages: [
        expect.objectContaining({ role: 'user', message_type: 'user_query', content: 'hello' }),
      ],
    });
  });

  test('conversation runtime sends persisted model-history checkpoint for rehydrate', async () => {
    const sentRehydrates: Record<string, unknown>[] = [];
    const transport = createMockAgentRuntimeTransport({
      rehydrateConversation: jest.fn(async payload => {
        sentRehydrates.push(payload);
      }),
    });
    const store = new InMemoryConversationStore();
    await store.appendEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: { text: 'full visible user text' },
    }));
    await store.replaceModelHistory({
      checkpointId: 'mh-rev-model-history-turn-1',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-row-tool',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-model-history',
          role: 'tool',
          messageType: 'tool_output',
          content: 'bounded tool output',
          toolCallId: 'call-1',
          toolName: 'read_file',
          imageRefs: ['artifact-1', 'data:image/png;base64,raw-preview'],
          sourceDisplayRowIds: ['display-tool'],
        },
      ],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      store,
      transport,
    });

    const rehydrate = await runtime.rehydrate({ workspace_path: '/tmp/workspace' });

    expect(rehydrate.messages).toEqual([
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
        content: 'bounded tool output',
        tool_call_id: 'call-1',
        screenshot_ref: 'artifact-1',
      }),
    ]);
    expect(rehydrate.messages[0]).not.toHaveProperty('image_refs');
    expect(rehydrate.messages[0]).not.toHaveProperty('source_display_row_ids');
    expect(sentRehydrates).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-sdk-runtime',
        rehydrate_mode: 'replace',
        messages: [],
        workspace_path: '/tmp/workspace',
        model_history: expect.objectContaining({
          checkpoint_id: 'mh-rev-model-history-turn-1',
          revision_id: 'rev-model-history',
          rows: [
            expect.objectContaining({
              id: 'mh-row-tool',
              role: 'tool',
              message_type: 'tool_output',
              content: 'bounded tool output',
              tool_call_id: 'call-1',
              image_refs: ['artifact-1'],
            }),
          ],
        }),
      }),
    ]);
  });

  test('conversation runtime attaches display row provenance to backend model-history checkpoints', async () => {
    const transport = createControllableAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'accepted'),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      store,
      transport,
    });
    runtime.attachTransport();

    await runtime.send({ text: 'visible question', turnRef: 'turn-provenance' });
    transport.emit(backendEvent('assistant-message-full', {
      conversation_ref: 'conv-sdk-runtime',
      revision_id: 'rev-model-history',
      content: 'visible answer',
    }, {
      eventId: 'evt-assistant-provenance',
      turnRef: 'turn-provenance',
      sequence: 1,
      revisionId: 'rev-model-history',
    }));
    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-model-history',
      checkpoint_id: 'mh-rev-model-history-turn-provenance',
      created_at: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-user-provenance',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'user',
          message_type: 'user_query',
          content: 'bounded visible question',
          source_display_row_ids: [],
        },
        {
          id: 'mh-assistant-provenance',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'assistant',
          message_type: 'assistant_response',
          content: 'visible answer',
          source_display_row_ids: [],
        },
      ],
    }, {
      eventId: 'evt-model-history-provenance',
      turnRef: 'turn-provenance',
      sequence: 2,
      revisionId: 'rev-model-history',
    }));

    await waitForExpect(async () => {
      await expect(store.loadModelHistory?.({
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-model-history',
      })).resolves.toMatchObject({
        checkpointId: 'mh-rev-model-history-turn-provenance',
        rows: [
          expect.objectContaining({
            id: 'mh-user-provenance',
            sourceDisplayRowIds: [expect.stringContaining('user_message')],
          }),
          expect.objectContaining({
            id: 'mh-assistant-provenance',
            sourceDisplayRowIds: ['conv-sdk-runtime:turn-provenance:assistant'],
          }),
        ],
      });
    });
  });

  test('conversation runtime does not guess model-history provenance after compaction rows', async () => {
    const transport = createControllableAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'accepted'),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-model-history',
      store,
      transport,
    });
    runtime.attachTransport();

    await runtime.send({ text: 'old visible question', turnRef: 'turn-old-visible' });
    transport.emit(backendEvent('assistant-message-full', {
      conversation_ref: 'conv-sdk-runtime',
      revision_id: 'rev-model-history',
      content: 'old visible answer',
    }, {
      eventId: 'evt-old-assistant',
      turnRef: 'turn-old-visible',
      sequence: 1,
      revisionId: 'rev-model-history',
    }));
    await runtime.send({ text: 'recent visible question', turnRef: 'turn-recent-visible' });
    transport.emit(backendEvent('assistant-message-full', {
      conversation_ref: 'conv-sdk-runtime',
      revision_id: 'rev-model-history',
      content: 'recent visible answer',
    }, {
      eventId: 'evt-recent-assistant',
      turnRef: 'turn-recent-visible',
      sequence: 1,
      revisionId: 'rev-model-history',
    }));
    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-model-history',
      checkpoint_id: 'mh-compacted-recent-tail',
      created_at: '2026-06-22T12:01:00.000Z',
      rows: [
        {
          id: 'mh-compaction-summary',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'assistant',
          message_type: 'context_compaction',
          content: 'Older messages were summarized.',
          source_display_row_ids: [],
        },
        {
          id: 'mh-recent-user',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'user',
          message_type: 'user_query',
          content: 'recent visible question',
          source_display_row_ids: [],
        },
        {
          id: 'mh-recent-assistant',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: 'rev-model-history',
          role: 'assistant',
          message_type: 'assistant_response',
          content: 'recent visible answer',
          source_display_row_ids: [],
        },
      ],
    }, {
      eventId: 'evt-compacted-model-history',
      turnRef: 'turn-recent-visible',
      sequence: 2,
      revisionId: 'rev-model-history',
    }));

    await waitForExpect(async () => {
      await expect(store.loadModelHistory?.({
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-model-history',
      })).resolves.toMatchObject({
        checkpointId: 'mh-compacted-recent-tail',
        rows: [
          expect.objectContaining({
            id: 'mh-compaction-summary',
            sourceDisplayRowIds: [],
          }),
          expect.objectContaining({
            id: 'mh-recent-user',
            sourceDisplayRowIds: [],
          }),
          expect.objectContaining({
            id: 'mh-recent-assistant',
            sourceDisplayRowIds: [],
          }),
        ],
      });
    });
  });

  test('conversation runtime replaces display rows as a child timeline revision without rewriting events', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: { text: 'original hello' },
    }));
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      store,
    });
    await runtime.load();

    const checkpoint = await runtime.replaceRows({
      baseRevisionId: 'rev-base',
      reason: 'user_edit',
      rows: [
        {
          id: 'display-user',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'edited hello',
          metadata: { revisionId: 'rev-base', eventId: 'evt-user' },
        },
      ],
    });

    expect(checkpoint.revisionId).not.toBe('rev-base');
    expect(checkpoint).toEqual(expect.objectContaining({
      conversationRef: 'conv-sdk-runtime',
      reason: 'user_edit',
      baseRevisionId: 'rev-base',
      rows: [
        expect.objectContaining({
          id: 'display-user',
          content: 'edited hello',
          revisionId: checkpoint.revisionId,
          metadata: expect.objectContaining({
            revisionId: checkpoint.revisionId,
          }),
        }),
      ],
    }));
    await expect(store.loadDisplayTimeline?.({
      conversationRef: 'conv-sdk-runtime',
      revisionId: checkpoint.revisionId,
    })).resolves.toMatchObject({
      revisionId: checkpoint.revisionId,
      rows: [
        expect.objectContaining({ content: 'edited hello' }),
      ],
    });
    await expect(store.loadEvents('conv-sdk-runtime')).resolves.toEqual([
      expect.objectContaining({ type: 'user_message', revisionId: 'rev-base' }),
      expect.objectContaining({ type: 'trace_event', revisionId: checkpoint.revisionId }),
    ]);
  });

  test('conversation runtime rejects display timeline rows with malformed attachment refs', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      store,
    });

    await expect(runtime.replaceRows({
      baseRevisionId: 'rev-base',
      reason: 'user_edit',
      rows: [
        {
          id: 'display-user',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'hello',
          metadata: {
            revisionId: 'rev-base',
            attachments: [
              {
                kind: 'image',
                source: 'user_included',
                status: 'ready',
              },
            ],
          },
        },
      ],
    })).rejects.toThrow('replaceRows attachment refs require stable ids');
  });

  test('conversation runtime replaces rows with matching bounded model-history prefix', async () => {
    const store = new InMemoryConversationStore();
    await store.replaceModelHistory({
      checkpointId: 'mh-base',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-user-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'user',
          messageType: 'user_query',
          content: 'first question',
          sourceDisplayRowIds: ['display-user-1'],
        },
        {
          id: 'mh-assistant-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'assistant',
          messageType: 'assistant_response',
          content: 'first answer',
          sourceDisplayRowIds: ['display-assistant-1'],
        },
        {
          id: 'mh-user-2',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'user',
          messageType: 'user_query',
          content: 'second question',
          sourceDisplayRowIds: ['display-user-2'],
        },
      ],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      store,
    });

    const checkpoint = await runtime.replaceRows({
      baseRevisionId: 'rev-base',
      reason: 'retry',
      rows: [
        {
          id: 'display-user-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'first question',
          metadata: { revisionId: 'rev-base' },
        },
        {
          id: 'display-assistant-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'first answer',
          metadata: { revisionId: 'rev-base' },
        },
      ],
    });
    const childModelHistory = await store.loadModelHistory?.({
      conversationRef: 'conv-sdk-runtime',
      revisionId: checkpoint.revisionId,
    });
    const traceEvents = await store.loadEvents('conv-sdk-runtime');

    expect(childModelHistory).toEqual(expect.objectContaining({
      checkpointId: `${checkpoint.revisionId}-replace-rows-model-history`,
      revisionId: checkpoint.revisionId,
      rows: [
        expect.objectContaining({
          content: 'first question',
          revisionId: checkpoint.revisionId,
          sourceDisplayRowIds: ['display-user-1'],
        }),
        expect.objectContaining({
          content: 'first answer',
          revisionId: checkpoint.revisionId,
          sourceDisplayRowIds: ['display-assistant-1'],
        }),
      ],
    }));
    expect(childModelHistory?.rows.map(row => row.content)).toEqual([
      'first question',
      'first answer',
    ]);
    expect(traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'trace_event',
        revisionId: checkpoint.revisionId,
        payload: expect.objectContaining({
          path: 'conversation.display_timeline',
          stage: 'replace_rows',
          data: expect.objectContaining({
            modelHistoryRowCount: 2,
            modelHistoryCheckpointId: `${checkpoint.revisionId}-replace-rows-model-history`,
          }),
        }),
      }),
    ]));
  });

  test('conversation runtime snapshots use active display timeline revisions', async () => {
    const store = new InMemoryConversationStore();
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'accepted'),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      store,
      transport,
    });

    const checkpoint = await runtime.replaceRows({
      baseRevisionId: 'rev-base',
      reason: 'retry',
      rows: [],
    });
    let snapshot = await runtime.load();

    expect(snapshot.state.revisionId).toBe(checkpoint.revisionId);
    expect(snapshot.displayRows).toEqual([]);

    await runtime.send({
      text: 'retry question',
      turnRef: 'turn-retry',
    });
    snapshot = await runtime.load();

    expect(snapshot.displayRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'user_message',
        content: 'retry question',
        metadata: expect.objectContaining({
          revisionId: checkpoint.revisionId,
        }),
      }),
    ]));
    await expect(store.loadEvents('conv-sdk-runtime')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'trace_event', revisionId: checkpoint.revisionId }),
      expect.objectContaining({ type: 'user_message', revisionId: checkpoint.revisionId }),
    ]));
  });

  test('conversation runtime snapshots expose durable rows through the conversation view', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-active',
      store,
    });
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-active',
      createdAt: '2026-06-25T03:10:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: [],
    });
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-one-user',
        turnRef: 'turn-one',
        source: 'sdk',
        payload: { text: 'sadsa' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-one-assistant',
        turnRef: 'turn-one',
        source: 'backend',
        payload: { text: 'Scripted runtime ready.' },
      }),
      createConversationEvent({
        type: 'turn_completed',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-one-complete',
        turnRef: 'turn-one',
        source: 'backend',
        payload: { finalResponse: 'Scripted runtime ready.' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-two-user',
        turnRef: 'turn-two',
        source: 'sdk',
        payload: { text: 'now it got replaced' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-two-assistant',
        turnRef: 'turn-two',
        source: 'backend',
        payload: { text: 'Scripted runtime ready.' },
      }),
      createConversationEvent({
        type: 'turn_completed',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-active',
        eventId: 'turn-two-complete',
        turnRef: 'turn-two',
        source: 'backend',
        payload: { finalResponse: 'Scripted runtime ready.' },
      }),
    ]);

    const snapshot = await runtime.load();

    expect(snapshot.view.displayRows.map(row => row.content)).toEqual([
      'sadsa',
      'Scripted runtime ready.',
      'now it got replaced',
      'Scripted runtime ready.',
    ]);
    expect(snapshot.view.liveTurn).toMatchObject({
      turnRef: 'turn-two',
      phase: 'complete',
      isBusy: false,
      canStop: false,
    });
    expect(snapshot.view.liveTurn.entries.map(entry => entry.text)).toEqual([
      'Scripted runtime ready.',
    ]);
  });

  test('conversation runtime forks display prefix and matching model history into a child conversation', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      eventId: 'display-user-1',
      turnRef: 'turn-1',
      source: 'sdk',
      payload: { text: 'first question' },
    }));
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: [
        {
          id: 'display-user-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'first question',
          metadata: { eventId: 'display-user-1', revisionId: 'rev-base' },
        },
        {
          id: 'display-assistant-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'first answer',
          metadata: { revisionId: 'rev-base' },
        },
        {
          id: 'display-user-2',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          index: 2,
          role: 'user',
          type: 'user_message',
          content: 'second question',
          metadata: { revisionId: 'rev-base' },
        },
      ],
    });
    await store.replaceModelHistory({
      checkpointId: 'mh-base',
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-user-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'user',
          messageType: 'user_query',
          content: 'first question',
          sourceDisplayRowIds: ['display-user-1'],
        },
        {
          id: 'mh-assistant-1',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'assistant',
          messageType: 'assistant_response',
          content: 'first answer',
          sourceDisplayRowIds: ['display-assistant-1'],
        },
        {
          id: 'mh-user-2',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-base',
          role: 'user',
          messageType: 'user_query',
          content: 'second question',
          sourceDisplayRowIds: ['display-user-2'],
        },
      ],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
      store,
    });

    const fork = await runtime.fork({
      sourceRevisionId: 'rev-base',
      cutAfterRowId: 'display-assistant-1',
      newConversationRef: 'conv-forked',
    });
    const display = await store.loadDisplayTimeline?.({
      conversationRef: 'conv-forked',
      revisionId: fork.revisionId,
    });
    const modelHistory = await store.loadModelHistory?.({
      conversationRef: 'conv-forked',
      revisionId: fork.revisionId,
    });
    const sourceModelHistory = await store.loadModelHistory?.({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-base',
    });
    const metadata = await store.listMetadata();
    const forkRuntime = new SdkConversationRuntime({
      conversationRef: 'conv-forked',
      revisionId: fork.revisionId,
      store,
    });
    const forkView = await forkRuntime.getView();
    const sourceView = await runtime.getView();

    expect(fork).toEqual(expect.objectContaining({
      conversationRef: 'conv-forked',
      sourceConversationRef: 'conv-sdk-runtime',
      sourceRevisionId: 'rev-base',
      displayRowCount: 2,
      modelHistoryRowCount: 2,
    }));
    expect(display?.rows.map(row => row.id)).toEqual(['display-user-1', 'display-assistant-1']);
    expect(display?.rows.every(row => row.conversationRef === 'conv-forked')).toBe(true);
    expect(modelHistory?.rows.map(row => row.content)).toEqual(['first question', 'first answer']);
    expect(sourceModelHistory?.rows.map(row => row.content)).toEqual([
      'first question',
      'first answer',
      'second question',
    ]);
    expect(forkView).toMatchObject({
      conversationRef: 'conv-forked',
      revisionId: fork.revisionId,
      liveTurn: {
        phase: 'idle',
        turnRef: null,
      },
    });
    expect(forkView.displayRows.map(row => row.content)).toEqual(['first question', 'first answer']);
    expect(sourceView.displayRows.map(row => row.content)).toEqual([
      'first question',
      'first answer',
      'second question',
    ]);
    expect(await store.loadEvents('conv-forked')).toEqual([]);
    expect(await store.loadEvents('conv-sdk-runtime')).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'user_message', revisionId: 'rev-base' }),
      expect.objectContaining({ type: 'trace_event' }),
    ]));
    expect(metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationRef: 'conv-forked',
        revisionId: fork.revisionId,
        title: 'first question',
        lastMessage: 'first answer',
        eventCount: 0,
      }),
    ]));

    const fullFork = await runtime.fork({
      sourceRevisionId: 'rev-base',
    });
    const fullDisplay = await store.loadDisplayTimeline?.({
      conversationRef: fullFork.conversationRef,
      revisionId: fullFork.revisionId,
    });
    const fullModelHistory = await store.loadModelHistory?.({
      conversationRef: fullFork.conversationRef,
      revisionId: fullFork.revisionId,
    });

    expect(fullFork.conversationRef).toMatch(/^conv_/);
    expect(fullFork.conversationRef).not.toBe('conv-sdk-runtime');
    expect(fullFork.cutAfterRowId).toBe('display-user-2');
    expect(fullFork.displayRowCount).toBe(3);
    expect(fullFork.modelHistoryRowCount).toBe(3);
    expect(fullDisplay?.rows.map(row => row.id)).toEqual([
      'display-user-1',
      'display-assistant-1',
      'display-user-2',
    ]);
    expect(fullModelHistory?.rows.map(row => row.content)).toEqual([
      'first question',
      'first answer',
      'second question',
    ]);

    await store.appendEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-forked',
      revisionId: fork.revisionId,
      turnRef: 'turn-child',
      source: 'sdk',
      timestamp: '2030-06-22T12:01:00.000Z',
      payload: { text: 'continue child branch' },
    }));

    expect(await store.listMetadata()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationRef: 'conv-forked',
        revisionId: fork.revisionId,
        title: 'first question',
        lastMessage: 'continue child branch',
        eventCount: 1,
      }),
    ]));
  });

  test('checkoutRevision keeps the conversation view on the selected branch live lane', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-parent',
        eventId: 'parent-user-event',
        turnRef: 'turn-parent',
        source: 'sdk',
        payload: { text: 'parent question' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-parent',
        eventId: 'parent-assistant-event',
        turnRef: 'turn-parent',
        source: 'backend',
        payload: { text: 'parent answer' },
      }),
      createConversationEvent({
        type: 'turn_completed',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-parent',
        turnRef: 'turn-parent',
        source: 'backend',
        payload: { finalResponse: 'parent answer' },
      }),
      createConversationEvent({
        type: 'turn_superseded',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-parent',
        source: 'sdk',
        payload: {
          supersededTurnRef: 'turn-parent',
          replacementTurnRef: 'turn-child',
          revisionId: 'rev-child',
          reason: 'user_edit',
          createdAt: '2026-06-24T12:05:00.000Z',
        },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-child',
        source: 'sdk',
        payload: { text: 'child question' },
      }),
      createConversationEvent({
        type: 'assistant_delta',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-child',
        source: 'backend',
        payload: { text: 'child answer streaming' },
      }),
    ]);
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-parent',
      createdAt: '2026-06-24T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: [
        {
          id: 'display-parent-user',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-parent',
          index: 0,
          role: 'user',
          type: 'user_message',
          turnRef: 'turn-parent',
          content: 'parent question',
          metadata: { eventId: 'parent-user-event', revisionId: 'rev-parent' },
        },
        {
          id: 'display-parent-assistant',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-parent',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          turnRef: 'turn-parent',
          content: 'parent answer',
          metadata: { eventId: 'parent-assistant-event', revisionId: 'rev-parent' },
        },
      ],
    });
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-child',
      createdAt: '2026-06-24T12:06:00.000Z',
      reason: 'user_edit',
      baseRevisionId: 'rev-parent',
      rows: [
        {
          id: 'display-child-user',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-child',
          index: 0,
          role: 'user',
          type: 'user_message',
          turnRef: 'turn-child',
          content: 'child question',
          metadata: {
            revisionId: 'rev-child',
            replacedDisplayRowId: 'display-parent-user',
          },
        },
      ],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-child',
      store,
    });

    await expect(runtime.getView()).resolves.toMatchObject({
      revisionId: 'rev-child',
      liveTurn: {
        turnRef: 'turn-child',
        phase: 'streaming',
      },
    });

    await expect(runtime.checkoutRevision({ revisionId: 'rev-parent' })).resolves.toMatchObject({
      displayTimeline: expect.objectContaining({
        revisionId: 'rev-parent',
      }),
    });
    const parentView = await runtime.getView();

    expect(parentView).toMatchObject({
      revisionId: 'rev-parent',
      liveTurn: {
        turnRef: 'turn-parent',
        phase: 'complete',
      },
      surfaces: {
        responseOverlay: {
          turnRef: 'turn-parent',
        },
      },
    });
    expect(parentView.displayRows.map(row => row.content)).toEqual([
      'parent question',
      'parent answer',
    ]);
    expect(parentView.liveTurn.entries.map(entry => entry.text).join('\n')).toContain('parent answer');
    expect(parentView.liveTurn.entries.map(entry => entry.text).join('\n')).not.toContain('child answer streaming');
  });

  test('conversation runtime records query dispatch trace around backend send', async () => {
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-dispatch-accepted'),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });

    await runtime.send({
      text: 'hello dispatch',
      turnRef: 'turn-dispatch-trace',
      payload: {
        existingFlag: true,
      },
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-dispatch-trace',
      path: 'query.dispatch',
    });

    expect(timeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'transport_send:started',
      'transport_send:succeeded',
    ]);
    expect(timeline[0].data).toEqual(expect.objectContaining({
      resourceCount: 0,
      payloadKeyCount: 1,
      hasModelOverride: false,
      hasConversationRef: true,
    }));
    expect(timeline[1].requestId).toBe('query-dispatch-accepted');
    expect(timeline[1].data).toEqual(expect.objectContaining({
      backendMessageId: 'query-dispatch-accepted',
      backendAccepted: true,
    }));
    expect(JSON.stringify(timeline)).not.toContain('hello dispatch');
    expect(buildDisplayConversation(events).messages.some(message => message.messageType === 'trace_event')).toBe(false);
    expect(buildRehydrateSnapshot(events).messages.some(message => message.message_type === 'trace_event')).toBe(false);
  });

  test('conversation runtime records agent definition and workspace feature traces', async () => {
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-feature-paths'),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      agentDefinition: {
        tools: [{ name: 'read_file', description: 'do not persist tool payload text' }],
        plugins: [{ id: 'plugin-secret-payload' }],
        mcps: [{ id: 'mcp-secret-payload' }],
        skills: [{ id: 'skill-secret-payload' }],
      },
      resourceResolvers: {
        workspace: async resource => ({
          kind: 'workspace',
          workspacePath: resource.kind === 'workspace' ? resource.workspacePath : null,
          metadata: {
            workspace_path: resource.kind === 'workspace' ? resource.workspacePath : null,
          },
        }),
      },
    });

    await runtime.send({
      text: 'inspect this workspace',
      turnRef: 'turn-feature-paths',
      resources: [{
        kind: 'workspace',
        workspacePath: '/Users/dev/workspaces/project-alpha',
      }],
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    const agentTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-feature-paths',
      path: 'agent.definition',
    });
    expect(agentTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'shape:succeeded',
    ]);
    expect(agentTimeline[0].data).toEqual(expect.objectContaining({
      hasAgentDefinition: true,
      toolCount: 1,
      pluginCount: 1,
      mcpCount: 1,
      skillCount: 1,
      hasWorkspacePath: true,
      hasLocalRuntime: false,
    }));
    const workspaceTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-feature-paths',
      path: 'workspace.context',
    });
    expect(workspaceTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'resolve:succeeded',
    ]);
    expect(workspaceTimeline[0].data).toEqual(expect.objectContaining({
      workspaceResourceCount: 1,
      hasWorkspacePath: true,
      hasWorkspaceResource: true,
      sourceKind: 'resource',
    }));
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-feature-paths',
      path: 'extension.load',
    })).toEqual([
      expect.objectContaining({
        stage: 'contribute',
        status: 'succeeded',
        data: expect.objectContaining({
          pluginCount: 1,
          hasAgentDefinition: true,
        }),
      }),
    ]);
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-feature-paths',
      path: 'mcp.tool',
    })).toEqual([
      expect.objectContaining({
        stage: 'contribute',
        status: 'succeeded',
        data: expect.objectContaining({
          mcpServerCount: 1,
          hasAgentDefinition: true,
        }),
      }),
    ]);
    expect(JSON.stringify(agentTimeline)).not.toContain('do not persist tool payload text');
    expect(JSON.stringify(agentTimeline)).not.toContain('skill-secret-payload');
    expect(JSON.stringify(workspaceTimeline)).not.toContain('/Users/peterbui');
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('inspect this workspace');
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('plugin-secret-payload');
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('mcp-secret-payload');
  });

  test('conversation runtime records skipped query dispatch when no backend transport is attached', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
    });

    const result = await runtime.send({
      text: 'offline dispatch',
      turnRef: 'turn-dispatch-skipped',
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-dispatch-skipped',
      path: 'query.dispatch',
    });

    expect(result.queryMessageId).toBe('turn-dispatch-skipped');
    expect(timeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'transport_send:skipped',
    ]);
    expect(timeline[0].data).toEqual(expect.objectContaining({
      reason: 'transport_unavailable',
      resourceCount: 0,
      payloadKeyCount: 0,
      hasModelOverride: false,
    }));
    expect(JSON.stringify(timeline)).not.toContain('offline dispatch');
  });

  test('conversation runtime records MCP contribution from client manifest tools', async () => {
    const transport = createMockAgentRuntimeTransport({
      sendQuery: jest.fn(async () => 'query-mcp-manifest'),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      agentDefinition: {
        metadata: {
          client_capability_revision: 'cap_sdk_trace',
        },
        tools: {
          mode: 'client_only',
          client_manifest: {
            version: 1,
            tools: [
              { name: 'read_file', schema: { type: 'object' } },
              {
                name: 'cua_driver__get_open_windows',
                mcp_server_id: 'cua-driver',
                schema: { type: 'object' },
              },
            ],
          },
        },
      },
    });

    await runtime.send({
      text: 'inspect mcp manifest tools',
      turnRef: 'turn-mcp-manifest',
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-mcp-manifest',
      path: 'agent.definition',
    })).toEqual([
      expect.objectContaining({
        stage: 'shape',
        status: 'succeeded',
        data: expect.objectContaining({
          toolCount: 2,
          mcpManifestToolCount: 1,
          capabilityRevision: 'cap_sdk_trace',
        }),
      }),
    ]);
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-mcp-manifest',
      path: 'mcp.tool',
    })).toEqual([
      expect.objectContaining({
        stage: 'contribute',
        status: 'succeeded',
        data: expect.objectContaining({
          mcpServerCount: 1,
          mcpDefinitionCount: 0,
          mcpManifestToolCount: 1,
          capabilityRevision: 'cap_sdk_trace',
        }),
      }),
    ]);
  });

  test('conversation runtime merges SDK MCP manifest with query agent context before trace and dispatch', async () => {
    const sendQuery = jest.fn(async () => 'query-mcp-merged');
    const transport = createMockAgentRuntimeTransport({ sendQuery });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      agentDefinition: {
        id: 'sdk-agent',
        tools: {
          mode: 'client_only',
          client_manifest: {
            version: 1,
            tools: [
              {
                name: 'cua_driver__get_open_windows',
                mcp_server_id: 'cua-driver',
                schema: { type: 'object' },
              },
            ],
          },
        },
      },
    });

    await runtime.send({
      text: 'do you have the CUA MCP',
      turnRef: 'turn-mcp-merge',
      payload: {
        agent_definition: {
          id: 'electron-context',
          tools: {
            mode: 'default_plus_client',
            enabled_remote_tools: [],
          },
          runtime: {
            workspace_path: '/tmp/project',
          },
          agents_md: [
            {
              id: 'repo',
              type: 'agents_md',
              priority: 50,
              content: 'Follow repo rules.',
            },
          ],
        },
      },
    });

    expect(sendQuery).toHaveBeenCalledWith(expect.objectContaining({
      agent_definition: expect.objectContaining({
        id: 'electron-context',
        runtime: expect.objectContaining({
          workspace_path: '/tmp/project',
        }),
        agents_md: [
          expect.objectContaining({ id: 'repo' }),
        ],
        tools: expect.objectContaining({
          mode: 'default_plus_client',
          client_manifest: expect.objectContaining({
            tools: [
              expect.objectContaining({
                name: 'cua_driver__get_open_windows',
                mcp_server_id: 'cua-driver',
              }),
            ],
          }),
        }),
      }),
    }), expect.objectContaining({ messageId: 'turn-mcp-merge' }));

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-mcp-merge',
      path: 'agent.definition',
    })).toEqual([
      expect.objectContaining({
        stage: 'shape',
        status: 'succeeded',
        data: expect.objectContaining({
          toolCount: 1,
          sdkToolCount: 1,
          queryToolCount: 0,
          mcpManifestToolCount: 1,
          sdkMcpManifestToolCount: 1,
          queryMcpManifestToolCount: 0,
          hasSdkAgentDefinition: true,
          hasQueryAgentDefinition: true,
          hasWorkspacePath: false,
        }),
      }),
    ]);
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-mcp-merge',
      path: 'mcp.tool',
    })).toEqual([
      expect.objectContaining({
        stage: 'contribute',
        status: 'succeeded',
        data: expect.objectContaining({
          mcpServerCount: 1,
          mcpManifestToolCount: 1,
        }),
      }),
    ]);
  });

  test('conversation runtime terminalizes active turn for unsequenced backend error envelope', async () => {
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        subscribe: jest.fn(listener => {
          backendListener = listener;
          return () => {
            backendListener = null;
          };
        }),
        sendQuery: jest.fn(async () => 'turn-active-error'),
      }),
    });
    runtime.attachTransport();

    await runtime.send({ text: 'review attached files', turnRef: 'turn-active-error' });
    backendListener?.({
      id: 'turn-active-error',
      type: 'error',
      payload: {
        message: 'Internal server error. Start a new chat and try again.',
      },
    } as BackendEvent);

    await waitForExpect(async () => {
      const snapshot = await runtime.load();
      expect(snapshot.currentTurn).toMatchObject({
        phase: 'error',
        lastError: 'Internal server error. Start a new chat and try again.',
      });
      expect(snapshot.currentTurn.presentation).toMatchObject({
        isBusy: false,
        typingVisible: false,
        isTerminal: true,
      });
      expect(snapshot.displayRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'error',
            content: 'Internal server error. Start a new chat and try again.',
            turnRef: 'turn-active-error',
          }),
        ]),
      );
    });

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'turn_started',
      'user_message',
      'turn_error',
    ]);
  });

  test('conversation runtime does not repair explicit rehydrate payload identity', async () => {
    const rehydrateConversation = jest.fn(async () => undefined);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockAgentRuntimeTransport({
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
      transport: createMockAgentRuntimeTransport(),
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
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'turn_started',
      'user_message',
      'memory_retrieval_diagnostic',
      'user_message_metadata',
    ]);
    expect(events.find(storedEvent => storedEvent.type === 'memory_retrieval_diagnostic')).toMatchObject({
      type: 'memory_retrieval_diagnostic',
      source: 'sdk',
      turnRef: 'turn-memory-diag',
      payload: expect.objectContaining({
        stage: 'embedding_request_failed',
        error: '503 Service Unavailable',
      }),
    });
  });

  test('conversation runtime persists memory trace events without display rows', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockAgentRuntimeTransport(),
      enrichQuery: async input => {
        await input.emitTrace?.({
          path: 'memory.retrieval',
          stage: 'retrieval',
          status: 'started',
          data: {
            apiKey: 'secret-api-key',
            authToken: 'secret-token',
            embeddingDimension: 3,
            queryLength: input.text.length,
            text: input.text,
          },
        });
        await input.emitTrace?.({
          path: 'memory.retrieval',
          stage: 'retrieval',
          status: 'succeeded',
          data: {
            episodicResultCount: 0,
            semanticResultCount: 0,
          },
        });
        return { content: '<user_query>hello</user_query>' };
      },
    });

    await runtime.send({ text: 'hello secret text', turnRef: 'turn-memory-trace' });

    const events = await store.loadEvents('conv-sdk-runtime');
    const traceEvents = events.filter(storedEvent => (
      storedEvent.type === 'trace_event'
      && storedEvent.payload.path === 'memory.retrieval'
    ));
    expect(traceEvents).toHaveLength(2);
    expect(traceEvents[0]).toMatchObject({
      type: 'trace_event',
      source: 'sdk',
      turnRef: 'turn-memory-trace',
      payload: expect.objectContaining({
        schemaVersion: 1,
        path: 'memory.retrieval',
        stage: 'retrieval',
        status: 'started',
        runtime: 'sdk',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-memory-trace',
        data: expect.objectContaining({
          apiKey: '[redacted]',
          authToken: '[redacted]',
          embeddingDimension: 3,
          queryLength: 'hello secret text'.length,
          text: '[redacted]',
        }),
      }),
    });
    const displayRows = await store.loadDisplayRows('conv-sdk-runtime');
    expect(displayRows.map(row => row.type)).toEqual(['user_message']);
    expect(buildTraceTimeline(events, {
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-memory-trace',
      path: 'memory.retrieval',
    })).toEqual([
      expect.objectContaining({
        eventId: traceEvents[0].eventId,
        path: 'memory.retrieval',
        status: 'started',
      }),
      expect.objectContaining({
        eventId: traceEvents[1].eventId,
        path: 'memory.retrieval',
        status: 'succeeded',
      }),
    ]);
  });

  test('conversation runtime emits memory store invalidation after completed-turn memory success', async () => {
    const notifiedTypes: string[] = [];
    const transport = createControllableAgentRuntimeTransport();
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
      expect(notifiedTypes).toContain('memory_store_changed');
    });
    const visibleTypes = notifiedTypes.filter(type => type !== 'trace_event');
    expect(visibleTypes).toContain('turn_completed');
    expect(visibleTypes).toContain('memory_store_changed');
    expect(visibleTypes.indexOf('turn_completed')).toBeLessThan(visibleTypes.indexOf('memory_store_changed'));
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).not.toContain('memory_persistence_diagnostic' as any);
    const memoryTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-store-memory',
      path: 'memory.persistence',
    });
    expect(memoryTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'completed_turn:started',
      'completed_turn:succeeded',
    ]);
    expect(memoryTimeline[0].data).toEqual(expect.objectContaining({
      memoryEnabled: true,
      hasLocalRuntime: true,
      hasSdkClient: true,
      userQueryLength: 5,
      assistantResponseLength: 5,
    }));
    expect(memoryTimeline[1].data).toEqual(expect.objectContaining({
      memoryTypes: ['episodic'],
      hasMemoryId: true,
    }));
    expect(JSON.stringify(memoryTimeline)).not.toContain('hello');
    expect(JSON.stringify(memoryTimeline)).not.toContain('world');
    expect(events.find(storedEvent => storedEvent.type === 'memory_store_changed')).toMatchObject({
      payload: expect.objectContaining({
        userId: 'user-sdk-runtime',
        conversationRef: 'conv-sdk-runtime',
        memoryTypes: ['episodic'],
        reason: 'completed_turn',
        memoryId: 'mem-1',
      }),
    });
  });

  test('completed-turn memory persistence does not block a later resend turn stream', async () => {
    let resolveEmbedding!: () => void;
    const embeddingPending = new Promise<{ embedding: number[]; embedding_space_version: string }>(resolve => {
      resolveEmbedding = () => resolve({
        embedding: [0.1],
        embedding_space_version: 'embed-v1',
      });
    });
    const notifiedEvents: Array<{ type: ConversationEvent['type']; turnRef: string | null }> = [];
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        embeddings: {
          create: jest.fn(async () => embeddingPending),
        },
      } as any,
      localRuntime: {
        rpc: jest.fn(async () => ({
          success: true,
          data: { memory_id: 'mem-delayed' },
        })),
      },
      userId: 'user-sdk-runtime',
    });
    runtime.subscribeEvents(event => {
      notifiedEvents.push({ type: event.type, turnRef: event.turnRef ?? null });
    });
    runtime.attachTransport();

    await runtime.send({ text: 'old turn', turnRef: 'turn-old-memory' });
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'old response' },
      {
        eventId: 'turn-old-memory-evt-000001-streaming-complete',
        turnRef: 'turn-old-memory',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(notifiedEvents).toContainEqual({
        type: 'turn_completed',
        turnRef: 'turn-old-memory',
      });
    });

    await runtime.send({ text: 'edited resend', turnRef: 'turn-new-resend' });
    transport.emit(backendEvent(
      'query-accepted',
      { status: 'accepted' },
      {
        eventId: 'turn-new-resend-evt-000001-query-accepted',
        turnRef: 'turn-new-resend',
        sequence: 1,
      },
    ));
    transport.emit(backendEvent(
      'system-prompt',
      { text: 'system prompt' },
      {
        eventId: 'turn-new-resend-evt-000002-system-prompt',
        turnRef: 'turn-new-resend',
        sequence: 2,
      },
    ));
    transport.emit(backendEvent(
      'tool-schemas',
      { tools: [] },
      {
        eventId: 'turn-new-resend-evt-000003-tool-schemas',
        turnRef: 'turn-new-resend',
        sequence: 3,
      },
    ));

    await waitForExpect(() => {
      expect(notifiedEvents).toContainEqual({
        type: 'system_prompt',
        turnRef: 'turn-new-resend',
      });
      expect(notifiedEvents).toContainEqual({
        type: 'tool_schemas_metadata',
        turnRef: 'turn-new-resend',
      });
    });
    const eventsBeforeMemoryResolves = await store.loadEvents('conv-sdk-runtime');
    expect(eventsBeforeMemoryResolves).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'system_prompt', turnRef: 'turn-new-resend' }),
      expect.objectContaining({ type: 'tool_schemas_metadata', turnRef: 'turn-new-resend' }),
    ]));

    resolveEmbedding();
    await waitForExpect(() => {
      expect(notifiedEvents).toContainEqual({
        type: 'memory_store_changed',
        turnRef: 'turn-old-memory',
      });
    });
  });

  test('edit resend supersedes the old live turn as an inert audit lane', async () => {
    const notifiedSnapshots: Array<{
      eventType: ConversationEvent['type'];
      eventTurnRef: string | null;
      currentTurnRef: string | null;
      phase: string;
      assistantText: string;
    }> = [];
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const replaceModelHistory = jest.spyOn(store, 'replaceModelHistory');
    const embeddingsCreate = jest.fn(async () => ({
      embedding: [0.1],
      embedding_space_version: 'embed-v1',
    }));
    const rpc = jest.fn(async () => ({
      success: true,
      data: { memory_id: 'mem-superseded' },
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
    runtime.subscribeEvents((event, snapshot) => {
      notifiedSnapshots.push({
        eventType: event.type,
        eventTurnRef: event.turnRef ?? null,
        currentTurnRef: snapshot.currentTurn.turnRef ?? null,
        phase: snapshot.currentTurn.phase,
        assistantText: snapshot.currentTurn.assistantText,
      });
    });
    runtime.attachTransport();

    await runtime.send({ text: 'old prompt', turnRef: 'turn-old-live' });
    transport.emit(backendEvent(
      'streaming-response',
      { text: 'old partial' },
      {
        eventId: 'turn-old-live-evt-000001-streaming-response',
        turnRef: 'turn-old-live',
        sequence: 1,
      },
    ));
    await waitForExpect(() => {
      expect(notifiedSnapshots).toContainEqual(expect.objectContaining({
        eventType: 'assistant_delta',
        currentTurnRef: 'turn-old-live',
        phase: 'streaming',
        assistantText: 'old partial',
      }));
    });

    await runtime.editAndResend({
      messageId: 'turn-old-live-sdk-evt-000002-user_message',
      text: 'replacement prompt',
      turnRef: 'turn-new-live',
    });
    await waitForExpect(() => {
      expect(transport.stop).toHaveBeenCalledWith({
        conversation_ref: 'conv-sdk-runtime',
        turn_ref: 'turn-old-live',
      });
    });

    transport.emit(backendEvent(
      'system-prompt',
      { text: 'old hidden system prompt' },
      {
        eventId: 'turn-old-live-evt-000002-system-prompt',
        turnRef: 'turn-old-live',
        sequence: 2,
      },
    ));
    transport.emit(backendEvent(
      'tool-schemas',
      { tools: [{ name: 'old_tool' }] },
      {
        eventId: 'turn-old-live-evt-000003-tool-schemas',
        turnRef: 'turn-old-live',
        sequence: 3,
      },
    ));
    transport.emit(backendEvent(
      'streaming-response',
      { text: ' old late content' },
      {
        eventId: 'turn-old-live-evt-000004-streaming-response',
        turnRef: 'turn-old-live',
        sequence: 4,
      },
    ));
    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-old-live',
      checkpoint_id: 'mh-old-live',
      rows: [{
        id: 'mh-old-user',
        role: 'user',
        message_type: 'user_query',
        content: 'old prompt',
        revision_id: 'rev-old-live',
      }],
    }, {
      eventId: 'turn-old-live-evt-000005-model-history-updated',
      turnRef: 'turn-old-live',
      sequence: 5,
    }));
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'old final should stay audit only' },
      {
        eventId: 'turn-old-live-evt-000006-streaming-complete',
        turnRef: 'turn-old-live',
        sequence: 6,
      },
    ));

    await waitForExpect(async () => {
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'turn_superseded', turnRef: 'turn-old-live' }),
        expect.objectContaining({ type: 'system_prompt', turnRef: 'turn-old-live' }),
        expect.objectContaining({ type: 'tool_schemas_metadata', turnRef: 'turn-old-live' }),
        expect.objectContaining({ type: 'assistant_delta', turnRef: 'turn-old-live' }),
        expect.objectContaining({ type: 'model_history_updated', turnRef: 'turn-old-live' }),
        expect.objectContaining({ type: 'turn_completed', turnRef: 'turn-old-live' }),
      ]));
    });
    expect(runtime.isTurnSuperseded('turn-old-live')).toBe(true);
    expect(replaceModelHistory).not.toHaveBeenCalledWith(expect.objectContaining({
      checkpointId: 'mh-old-live',
    }));
    expect(rpc).not.toHaveBeenCalled();

    transport.emit(backendEvent(
      'query-accepted',
      { status: 'accepted' },
      {
        eventId: 'turn-new-live-evt-000001-query-accepted',
        turnRef: 'turn-new-live',
        sequence: 1,
      },
    ));
    transport.emit(backendEvent(
      'streaming-response',
      { text: 'new answer' },
      {
        eventId: 'turn-new-live-evt-000002-streaming-response',
        turnRef: 'turn-new-live',
        sequence: 2,
      },
    ));
    await runtime.stop('turn-old-live');
    expect(buildCurrentTurnProjection(await store.loadEvents('conv-sdk-runtime'))).toMatchObject({
      turnRef: 'turn-new-live',
      phase: 'streaming',
      assistantText: 'new answer',
    });
    transport.emit(backendEvent('model-history-updated', {
      revision_id: 'rev-new-live',
      checkpoint_id: 'mh-new-live',
      rows: [{
        id: 'mh-new-user',
        role: 'user',
        message_type: 'user_query',
        content: 'replacement prompt',
        revision_id: 'rev-new-live',
      }],
    }, {
      eventId: 'turn-new-live-evt-000003-model-history-updated',
      turnRef: 'turn-new-live',
      sequence: 3,
    }));
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'new final' },
      {
        eventId: 'turn-new-live-evt-000004-streaming-complete',
        turnRef: 'turn-new-live',
        sequence: 4,
      },
    ));

    await waitForExpect(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });
    expect(embeddingsCreate).toHaveBeenCalledWith({
      text: 'User: replacement prompt\nAssistant: new final',
    });
    expect(replaceModelHistory).toHaveBeenCalledWith(expect.objectContaining({
      checkpointId: 'mh-new-live',
      revisionId: 'rev-new-live',
    }));

    const events = await store.loadEvents('conv-sdk-runtime');
    const currentTurn = buildCurrentTurnProjection(events);
    expect(currentTurn).toMatchObject({
      turnRef: 'turn-new-live',
      phase: 'complete',
      assistantText: 'new answer',
    });
    expect(currentTurn.assistantText).not.toContain('old late content');
    const rows = await store.loadDisplayRows('conv-sdk-runtime');
    expect(rows.map(row => row.content)).toEqual(['replacement prompt', 'new answer']);
    expect(JSON.stringify(rows)).not.toContain('old late content');
    const supersessionTrace = buildTraceTimeline(events, {
      turnRef: 'turn-old-live',
      path: 'turn.supersession',
    });
    expect(supersessionTrace.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'late_event:ignored_for_live_authority',
      'late_event:ignored_for_live_authority',
      'late_event:ignored_for_live_authority',
      'late_event:ignored_for_live_authority',
      'late_event:ignored_for_live_authority',
    ]);
    expect(JSON.stringify(supersessionTrace)).not.toContain('old hidden system prompt');
    expect(JSON.stringify(supersessionTrace)).not.toContain('old final should stay audit only');
  });

  test('conversation runtime stores completed-turn memory from the pending turn ledger', async () => {
    const transport = createControllableAgentRuntimeTransport();
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

  test('conversation runtime generates a title after the first completed assistant reply', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const generateConversationTitle = jest.fn(async () => ({
      success: true,
      title: 'Project Setup',
    }));
    const rpc = jest.fn(async request => {
      if (request.method === 'get_conversation_title_state') {
        return {
          success: true,
          data: {
            conversation_id: 'conv-sdk-runtime',
            title: '',
            source: '',
            is_locked: false,
            has_title: false,
          },
        };
      }
      if (request.method === 'update_conversation_title') {
        return {
          success: true,
          data: {
            conversation_id: 'conv-sdk-runtime',
            title: request.params.title,
          },
        };
      }
      return { success: false, error: `unexpected RPC ${request.method}` };
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        generateConversationTitle,
      } as any,
      localRuntime: { rpc },
      userId: 'user-sdk-runtime',
      memoryEnabled: false,
    });
    runtime.attachTransport();

    await runtime.send({ text: 'build title generation', turnRef: 'turn-title' });
    transport.emit(backendEvent(
      'streaming-complete',
      {
        final_response: 'The title generation path is now implemented.',
        model_id: 'gpt-title',
        model_provider: 'openai',
      },
      {
        eventId: 'turn-title-evt-000001-streaming-complete',
        turnRef: 'turn-title',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(generateConversationTitle).toHaveBeenCalledTimes(1);
    });
    expect(generateConversationTitle).toHaveBeenCalledWith({
      user_id: 'user-sdk-runtime',
      user_message: 'build title generation',
      assistant_message: 'The title generation path is now implemented.',
      model_id: 'gpt-title',
      model_provider: 'openai',
    });
    expect(rpc).toHaveBeenCalledWith({
      method: 'get_conversation_title_state',
      params: {
        user_id: 'user-sdk-runtime',
        conversation_id: 'conv-sdk-runtime',
      },
    });
    expect(rpc).toHaveBeenCalledWith({
      method: 'update_conversation_title',
      params: {
        user_id: 'user-sdk-runtime',
        conversation_id: 'conv-sdk-runtime',
        title: 'Project Setup',
      },
    });
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).toContain('turn_completed');
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-title',
      path: 'local_runtime.rpc',
    });
    expect(timeline.map(entry => `${entry.data?.method}:${entry.status}`)).toEqual([
      'get_conversation_title_state:started',
      'get_conversation_title_state:succeeded',
      'update_conversation_title:started',
      'update_conversation_title:succeeded',
    ]);
    expect(timeline[0].data).toEqual(expect.objectContaining({
      method: 'get_conversation_title_state',
      paramsKeyCount: 2,
      hasParams: true,
    }));
    expect(timeline[3].data).toEqual(expect.objectContaining({
      method: 'update_conversation_title',
      successFlag: true,
    }));
    const titleTimeline = buildTraceTimeline(events, {
      turnRef: 'turn-title',
      path: 'title.generation',
    });
    expect(titleTimeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'generate:started',
      'generate:succeeded',
    ]);
    expect(titleTimeline[0].data).toEqual(expect.objectContaining({
      hasModelId: true,
      modelProvider: 'openai',
      userMessageLength: 'build title generation'.length,
      assistantMessageLength: 'The title generation path is now implemented.'.length,
    }));
    expect(titleTimeline[1].data).toEqual(expect.objectContaining({
      success: true,
      titleLength: 'Project Setup'.length,
    }));
    expect(JSON.stringify(timeline)).not.toContain('build title generation');
    expect(JSON.stringify(timeline)).not.toContain('The title generation path is now implemented.');
    expect(JSON.stringify(timeline)).not.toContain('Project Setup');
    expect(JSON.stringify(titleTimeline)).not.toContain('build title generation');
    expect(JSON.stringify(titleTimeline)).not.toContain('The title generation path is now implemented.');
    expect(JSON.stringify(titleTimeline)).not.toContain('Project Setup');
  });

  test('conversation runtime skips generated title when durable title already exists', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const generateConversationTitle = jest.fn(async () => ({
      success: true,
      title: 'Should Not Write',
    }));
    const rpc = jest.fn(async () => ({
      success: true,
      data: {
        conversation_id: 'conv-sdk-runtime',
        title: 'Existing Title',
        source: 'model',
        is_locked: false,
        has_title: true,
      },
    }));
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        generateConversationTitle,
      } as any,
      localRuntime: { rpc },
      userId: 'user-sdk-runtime',
      memoryEnabled: false,
    });
    runtime.attachTransport();

    await runtime.send({ text: 'do not retitle', turnRef: 'turn-title-existing' });
    transport.emit(backendEvent(
      'streaming-complete',
      { final_response: 'Existing title should be preserved.' },
      {
        eventId: 'turn-title-existing-evt-000001-streaming-complete',
        turnRef: 'turn-title-existing',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(rpc).toHaveBeenCalledWith({
        method: 'get_conversation_title_state',
        params: {
          user_id: 'user-sdk-runtime',
          conversation_id: 'conv-sdk-runtime',
        },
      });
    });
    await tick();
    expect(generateConversationTitle).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(expect.objectContaining({
      method: 'update_conversation_title',
    }));
  });

  test('conversation runtime title generation ignores removed provider payload alias', async () => {
    const transport = createControllableAgentRuntimeTransport();
    const generateConversationTitle = jest.fn(async () => ({
      success: true,
      title: 'Alias Ignored',
    }));
    const rpc = jest.fn(async request => {
      if (request.method === 'get_conversation_title_state') {
        return {
          success: true,
          data: {
            conversation_id: 'conv-sdk-runtime',
            title: '',
            source: '',
            is_locked: false,
            has_title: false,
          },
        };
      }
      return { success: true, data: { title: request.params.title } };
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
      sdkClient: {
        generateConversationTitle,
      } as any,
      localRuntime: { rpc },
      userId: 'user-sdk-runtime',
      memoryEnabled: false,
    });
    runtime.attachTransport();

    await runtime.send({ text: 'ignore provider alias', turnRef: 'turn-title-alias' });
    transport.emit(backendEvent(
      'streaming-complete',
      {
        final_response: 'The removed provider alias should not reach title generation.',
        model_id: 'gpt-title',
        provider: 'removed-provider-alias',
      },
      {
        eventId: 'turn-title-alias-evt-000001-streaming-complete',
        turnRef: 'turn-title-alias',
        sequence: 1,
      },
    ));

    await waitForExpect(() => {
      expect(generateConversationTitle).toHaveBeenCalledTimes(1);
    });
    expect(generateConversationTitle).toHaveBeenCalledWith({
      user_id: 'user-sdk-runtime',
      user_message: 'ignore provider alias',
      assistant_message: 'The removed provider alias should not reach title generation.',
      model_id: 'gpt-title',
    });
  });

  test('conversation runtime title generation failure does not block completed turn storage', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport = createControllableAgentRuntimeTransport();
    const store = new InMemoryConversationStore();
    const generateConversationTitle = jest.fn(async () => {
      throw new Error('title backend unavailable');
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
      sdkClient: {
        generateConversationTitle,
      } as any,
      localRuntime: {
        rpc: jest.fn(async () => ({
          success: true,
          data: {
            conversation_id: 'conv-sdk-runtime',
            title: '',
            source: '',
            is_locked: false,
            has_title: false,
          },
        })),
      },
      userId: 'user-sdk-runtime',
      memoryEnabled: false,
    });
    runtime.attachTransport();

    try {
      await runtime.send({ text: 'still complete', turnRef: 'turn-title-fails' });
      transport.emit(backendEvent(
        'streaming-complete',
        { final_response: 'The chat turn still completes.' },
        {
          eventId: 'turn-title-fails-evt-000001-streaming-complete',
          turnRef: 'turn-title-fails',
          sequence: 1,
        },
      ));

      await waitForExpect(async () => {
        const events = await store.loadEvents('conv-sdk-runtime');
        expect(events.map(storedEvent => storedEvent.type)).toContain('turn_completed');
      });
      await waitForExpect(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          '[Agent SDK] Conversation title generation failed:',
          'title backend unavailable',
        );
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('conversation runtime does not emit memory invalidation when completed turn state is missing', async () => {
    const transport = createControllableAgentRuntimeTransport();
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
      expect(events.map(storedEvent => storedEvent.type)).toContain('turn_completed');
    });
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.type)).not.toContain('memory_store_changed');
    expect(events.map(storedEvent => storedEvent.type)).not.toContain('memory_persistence_diagnostic' as any);
    expect(embeddingsCreate).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test('conversation runtime does not emit memory invalidation when completed-turn storage fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport = createControllableAgentRuntimeTransport();
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
          success: false,
          error: 'store denied',
        })),
      },
      userId: 'user-sdk-runtime',
    });
    runtime.attachTransport();

    try {
      await runtime.send({ text: 'hello failure', turnRef: 'turn-memory-fails' });
      transport.emit(backendEvent(
        'streaming-complete',
        { final_response: 'failure response' },
        {
          eventId: 'turn-memory-fails-evt-000001-streaming-complete',
          turnRef: 'turn-memory-fails',
          sequence: 1,
        },
      ));

      await waitForExpect(async () => {
        const events = await store.loadEvents('conv-sdk-runtime');
        expect(events.map(storedEvent => storedEvent.type)).toContain('turn_completed');
      });
      const events = await store.loadEvents('conv-sdk-runtime');
      expect(events.map(storedEvent => storedEvent.type)).not.toContain('memory_store_changed');
      expect(events.map(storedEvent => storedEvent.type)).not.toContain('memory_persistence_diagnostic' as any);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('conversation runtime processes backend events serially', async () => {
    const notifiedTypes: string[] = [];
    const transport = createControllableAgentRuntimeTransport();
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
      transport: createMockAgentRuntimeTransport({
        compactHistory,
      }),
    });

    await expect(runtime.compactHistory({ force: false })).resolves.toBe('compact-1');

    expect(compactHistory).toHaveBeenCalledWith({
      force: false,
      conversation_ref: 'conv-sdk-runtime',
    });
  });

  test('conversation runtime records SDK control transport traces', async () => {
    const transport = createMockAgentRuntimeTransport({
      rehydrateConversation: jest.fn(async () => undefined),
      compactHistory: jest.fn(async () => 'compact-control'),
      updateSettings: jest.fn(async () => 'settings-control'),
      listModels: jest.fn(async () => 'models-control'),
      wakewordDetected: jest.fn(async () => 'wakeword-control'),
      stop: jest.fn(async () => undefined),
    });
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport,
    });

    await runtime.rehydrateMessages({
      messages: [{ role: 'user', content: 'do not persist this in trace' }],
      rehydrate_mode: 'replace',
    } as any);
    await runtime.compactHistory({ force: false });
    await runtime.updateSettings({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      provider_api_keys: {
        openai: {
          api_key: 'sk-secret',
        },
      },
    } as any);
    await runtime.requestModelList();
    await runtime.wakewordDetected({ source: 'test', transcript: 'do not persist wakeword transcript' });
    await runtime.stop('turn-control-stop');

    const events = await store.loadEvents('conv-sdk-runtime');
    expect(buildTraceTimeline(events, { path: 'conversation.rehydrate' }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'transport_send:started',
      'transport_send:succeeded',
    ]);
    expect(buildTraceTimeline(events, { path: 'conversation.rehydrate' })[0].data).toEqual(expect.objectContaining({
      messageCount: 1,
      rehydrateMode: 'replace',
    }));
    expect(buildTraceTimeline(events, { path: 'compaction.lifecycle' }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'request:started',
      'request:succeeded',
    ]);
    expect(buildTraceTimeline(events, { path: 'compaction.lifecycle' })[1]).toEqual(expect.objectContaining({
      requestId: 'compact-control',
    }));
    expect(buildTraceTimeline(events, { path: 'settings.sync' }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'update:started',
      'update:succeeded',
    ]);
    expect(buildTraceTimeline(events, { path: 'settings.sync' })[0].data).toEqual(expect.objectContaining({
      updatedKeys: ['provider_api_keys', 'selected_model_id'],
    }));
    expect(buildTraceTimeline(events, { path: 'model.catalog' }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'list:started',
      'list:succeeded',
    ]);
    expect(buildTraceTimeline(events, { path: 'model.catalog' })[1]).toEqual(expect.objectContaining({
      requestId: 'models-control',
    }));
    expect(buildTraceTimeline(events, { path: 'wakeword.runtime' }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'activate:started',
      'activate:succeeded',
    ]);
    expect(buildTraceTimeline(events, { path: 'wakeword.runtime' })[1]).toEqual(expect.objectContaining({
      requestId: 'wakeword-control',
    }));
    expect(buildTraceTimeline(events, { path: 'websocket.control' }).map(entry => `${entry.data?.messageType}:${entry.status}`)).toEqual([
      'wakeword-detected:started',
      'wakeword-detected:succeeded',
      'stop-query:started',
      'stop-query:succeeded',
    ]);
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('do not persist this in trace');
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('sk-secret');
    expect(JSON.stringify(buildTraceTimeline(events))).not.toContain('do not persist wakeword transcript');
  });

  test('conversation runtime projects stop before backend transport resolves', async () => {
    let resolveStop: (() => void) | null = null;
    const stopPending = new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
    const transport = createControllableAgentRuntimeTransport({
      stop: jest.fn(() => stopPending),
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport,
    });
    const snapshots: Awaited<ReturnType<typeof runtime.load>>[] = [];
    runtime.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await runtime.send({ text: 'stop quickly', turnRef: 'turn-slow-stop' });
    const stopPromise = runtime.stop('turn-slow-stop');

    await waitForExpect(() => {
      expect(snapshots.at(-1)?.currentTurn).toMatchObject({
        turnRef: 'turn-slow-stop',
        phase: 'complete',
        presentation: expect.objectContaining({
          isBusy: false,
          isTerminal: true,
        }),
      });
    });
    await waitForExpect(() => {
      expect(transport.stop).toHaveBeenCalledWith({
        conversation_ref: 'conv-sdk-runtime',
        turn_ref: 'turn-slow-stop',
      });
    });

    transport.emit(backendEvent('assistant-message-full', {
      content: 'late backend text',
    }, {
      eventId: 'evt-late-after-stop',
      turnRef: 'turn-slow-stop',
    }));
    await tick();
    expect(snapshots.at(-1)?.currentTurn).toMatchObject({
      turnRef: 'turn-slow-stop',
      phase: 'complete',
      assistantText: '',
      presentation: expect.objectContaining({
        isBusy: false,
      }),
    });

    resolveStop?.();
    await stopPromise;
  });

  test('conversation runtime updates model selection before sending a turn', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const settingsUpdates: Record<string, unknown>[] = [];
    const transport = createMockAgentRuntimeTransport({
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
    expect(events.filter(event => event.type !== 'trace_event').map(event => event.type)).toEqual([
      'settings_updated',
      'turn_started',
      'user_message',
    ]);
    const settingsEvent = events.find(event => event.type === 'settings_updated');
    expect(settingsEvent?.payload).toMatchObject({
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
        message_type: 'user_query',
        content: 'use the selected model',
      }),
    ]);
  });

  test('editAndResend applies model selection through send before dispatching the replay query', async () => {
    const settingsUpdates: Record<string, unknown>[] = [];
    const sentQueries: Record<string, unknown>[] = [];
    const sendQuery = jest.fn(async payload => {
      sentQueries.push(payload);
      return 'query-edited';
    });
    const updateSettings = jest.fn(async payload => {
      settingsUpdates.push(payload);
      return 'settings-edit';
    });
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-edit',
        payload: { text: 'old text' },
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
      transport: createMockAgentRuntimeTransport({
        sendQuery,
        updateSettings,
      }),
    });

    await runtime.load();
    await runtime.editAndResend({
      messageId: 'user-edit',
      text: 'new text',
      turnRef: 'turn-edited',
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    });

    expect(settingsUpdates).toEqual([
      {
        selected_model_id: 'claude-sonnet-4-5',
        model_provider: 'anthropic',
      },
    ]);
    expect(sentQueries).toHaveLength(1);
    expect(sentQueries[0]).toMatchObject({
      text: 'new text',
      conversation_ref: 'conv-sdk-runtime',
    });
    expect(sentQueries[0]).not.toHaveProperty('model');
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      sendQuery.mock.invocationCallOrder[0],
    );
    const events = await store.loadEvents('conv-sdk-runtime');
    const settingsIndex = events.findIndex(event => event.type === 'settings_updated');
    const replacementUserIndex = events.findIndex(event => (
      event.type === 'user_message'
      && event.turnRef === 'turn-edited'
    ));
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(replacementUserIndex).toBeGreaterThan(settingsIndex);
  });

  test('retryTurn applies model selection through send before dispatching the replay query', async () => {
    const settingsUpdates: Record<string, unknown>[] = [];
    const sentQueries: Record<string, unknown>[] = [];
    const sendQuery = jest.fn(async payload => {
      sentQueries.push(payload);
      return 'query-retry';
    });
    const updateSettings = jest.fn(async payload => {
      settingsUpdates.push(payload);
      return 'settings-retry';
    });
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-retry',
        payload: { text: 'try again' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'assistant-retry',
        payload: { text: 'stale answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        sendQuery,
        updateSettings,
      }),
    });

    await runtime.load();
    await runtime.retryTurn({
      messageId: 'assistant-retry',
      turnRef: 'turn-retry',
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    });

    expect(settingsUpdates).toEqual([
      {
        selected_model_id: 'claude-sonnet-4-5',
        model_provider: 'anthropic',
      },
    ]);
    expect(sentQueries).toHaveLength(1);
    expect(sentQueries[0]).toMatchObject({
      text: 'try again',
      conversation_ref: 'conv-sdk-runtime',
    });
    expect(sentQueries[0]).not.toHaveProperty('model');
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      sendQuery.mock.invocationCallOrder[0],
    );
    const events = await store.loadEvents('conv-sdk-runtime');
    const settingsIndex = events.findIndex(event => event.type === 'settings_updated');
    const replacementUserIndex = events.findIndex(event => (
      event.type === 'user_message'
      && event.turnRef === 'turn-retry'
    ));
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(replacementUserIndex).toBeGreaterThan(settingsIndex);
  });

  test('scenario: tool turn, compaction, edit resend, and reload keep tool call/output pairs adjacent', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const sentRehydrates: Record<string, unknown>[] = [];
    const sentToolResults: Record<string, unknown>[] = [];
    const transport = createControllableAgentRuntimeTransport({
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
    const compactionLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
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
    compactionLogSpy.mockRestore();
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
    const originalRevisionId = (await runtime.load()).state.revisionId;
    transport.emit(backendEvent('model-history-updated', {
      checkpoint_id: 'mh-original',
      revision_id: originalRevisionId,
      rows: [
        {
          id: 'mh-original-user',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: originalRevisionId,
          role: 'user',
          message_type: 'user_query',
          content: 'Read README.md and summarize it.',
        },
        {
          id: 'mh-original-call',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: originalRevisionId,
          role: 'assistant',
          message_type: 'assistant_response',
          content: '',
          tool_call_id: 'call-original',
        },
        {
          id: 'mh-original-output',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: originalRevisionId,
          role: 'tool',
          message_type: 'tool_output',
          content: 'backend accepted README contents',
          tool_call_id: 'call-original',
          tool_name: 'read_file',
        },
        {
          id: 'mh-original-assistant',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: originalRevisionId,
          role: 'assistant',
          message_type: 'assistant_response',
          content: 'README summary done.',
        },
      ],
    }, { eventId: 'model-history-original', turnRef: 'turn-original' }));

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
        message_type: 'assistant_response',
        tool_call_id: 'call-original',
      }),
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
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
    const editedRevisionId = (await runtime.load()).state.revisionId;

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
    expect(sentRehydrates).toEqual([]);
    let storedEvents = await store.loadEvents('conv-sdk-runtime');
    expect(storedEvents.map(storedEvent => storedEvent.eventId)).toEqual(
      expect.arrayContaining([
        'backend-tool-call-original',
        'backend-tool-output-original',
        'assistant-original',
        'compaction-complete-original',
      ]),
    );
    expect((await runtime.load()).display.messages).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ toolCallId: 'call-original' }),
        expect.objectContaining({ text: 'backend accepted README contents' }),
        expect.objectContaining({ text: '- original summary' }),
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
    transport.emit(backendEvent('model-history-updated', {
      checkpoint_id: 'mh-edited',
      revision_id: editedRevisionId,
      rows: [
        {
          id: 'mh-edited-user',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: editedRevisionId,
          role: 'user',
          message_type: 'user_query',
          content: 'Read package.json and summarize it in bullets.',
        },
        {
          id: 'mh-edited-call',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: editedRevisionId,
          role: 'assistant',
          message_type: 'assistant_response',
          content: '',
          tool_call_id: 'call-edited',
        },
        {
          id: 'mh-edited-output',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: editedRevisionId,
          role: 'tool',
          message_type: 'tool_output',
          content: 'backend accepted package contents',
          tool_call_id: 'call-edited',
          tool_name: 'read_file',
        },
        {
          id: 'mh-edited-assistant',
          conversation_ref: 'conv-sdk-runtime',
          revision_id: editedRevisionId,
          role: 'assistant',
          message_type: 'assistant_response',
          content: '- package summary',
        },
      ],
    }, { eventId: 'model-history-edited', turnRef: 'turn-edited' }));

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
        message_type: 'user_query',
        content: 'Read package.json and summarize it in bullets.',
      }),
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
        tool_call_id: 'call-edited',
      }),
      expect.objectContaining({
        role: 'tool',
        message_type: 'tool_output',
        content: 'backend accepted package contents',
        tool_call_id: 'call-edited',
        tool_name: 'read_file',
      }),
      expect.objectContaining({
        role: 'assistant',
        message_type: 'assistant_response',
        content: '- package summary',
      }),
    ]);
    expect((await store.loadForDisplay('conv-sdk-runtime')).messages).toEqual(
      finalSnapshot.display.messages,
    );
    expect((await store.loadForRehydrate('conv-sdk-runtime')).messages).toEqual(
      finalSnapshot.rehydrate.messages,
    );
    storedEvents = await store.loadEvents('conv-sdk-runtime');
    expect(storedEvents.some(storedEvent => storedEvent.type === 'compaction_applied')).toBe(true);
  });

  test('conversation runtime validates model selections before sending a turn', async () => {
    const sendQuery = jest.fn(async () => 'query-unused');
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockAgentRuntimeTransport({
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
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        sendQuery: sendQuery as unknown as AgentRuntimeTransport['sendQuery'],
      }),
    });

    await expect(runtime.send({
      text: 'send failure',
      turnRef: 'turn-send-failure',
    })).rejects.toThrow('Failed to send query to backend');
    expect(sendQuery).toHaveBeenCalledTimes(1);
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'turn_started',
      'user_message',
      'turn_error',
    ]);
    expect(buildTraceTimeline(events, {
      turnRef: 'turn-send-failure',
      path: 'query.resources',
    }).map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'resolve:started',
      'resolve:succeeded',
    ]);
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-send-failure',
      path: 'query.dispatch',
    });
    expect(timeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'transport_send:started',
      'transport_send:failed',
    ]);
    expect(timeline[1].data).toEqual(expect.objectContaining({
      backendAccepted: false,
    }));
    expect(timeline[1].error).toEqual(expect.objectContaining({
      message: 'Failed to send query to backend',
    }));
    expect(JSON.stringify(timeline)).not.toContain('send failure');
    expect((await runtime.load()).currentTurn).toMatchObject({
      turnRef: 'turn-send-failure',
      phase: 'error',
      presentation: expect.objectContaining({
        typingVisible: false,
        overlayVisible: true,
        isTerminal: true,
      }),
    });
  });

  test('conversation runtime close clears snapshot and event listeners', async () => {
    const snapshotListener = jest.fn();
    const eventListener = jest.fn();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockAgentRuntimeTransport(),
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

  test('conversation runtime rejects pre-normalized send fields in strict environments', async () => {
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store: new InMemoryConversationStore(),
      transport: createMockAgentRuntimeTransport(),
    });

    await expect(runtime.send({
      text: 'hello',
      agentDefinition: { id: 'wrong-level-agent' },
      backendPayload: {
        agent_definition: { id: 'wrong-level-backend-payload' },
      },
      workspacePath: '/tmp/project',
    } as any)).rejects.toThrow(
      'ConversationRuntime.send received pre-normalized top-level field(s): agentDefinition, backendPayload, workspacePath',
    );
  });

  test('conversation runtime stream yields normalized events until backend completion', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    let backendListener: ((event: unknown) => void) | null = null;
    const transport = createMockAgentRuntimeTransport({
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
    const transport = createMockAgentRuntimeTransport({
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
      transport: createMockAgentRuntimeTransport({
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
      transport: createMockAgentRuntimeTransport({
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
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
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
      transport: createMockAgentRuntimeTransport({
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
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'tool_output',
    ]);
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-tool',
      path: 'tool.execution',
    });
    expect(timeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'single_tool:started',
      'single_tool:succeeded',
    ]);
    expect(timeline[0].data).toEqual(expect.objectContaining({
      toolName: 'read_file',
      argsKeyCount: 1,
    }));
    expect(timeline[1]).toEqual(expect.objectContaining({
      requestId: 'req-read',
    }));
    expect(timeline[1].data).toEqual(expect.objectContaining({
      toolName: 'read_file',
      success: true,
      deliveryFailed: false,
    }));
    expect(JSON.stringify(timeline)).not.toContain('README.md');
    expect((await runtime.load()).state.phase).toBe('tool_result_sent');
  });

  test('conversation runtime records browser runtime traces for browser tool calls', async () => {
    const sentToolResults: Record<string, unknown>[] = [];
    let backendListener: ((event: unknown) => void) | null = null;
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      localRuntime: {
        executeTool: jest.fn(async () => ({
          success: true,
          data: {
            mode: 'browser_use',
            scope: 'dedicated_browser',
            connected: true,
            tabs: [
              { title: 'Secret Docs', url: 'https://example.test/secret-token' },
            ],
            output: 'Connected to secret browser page.',
          },
        })),
      },
      transport: createMockAgentRuntimeTransport({
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
      id: 'turn-browser',
      event_id: 'turn-browser-evt-000001-tool-call',
      sequence: 1,
      type: 'tool-call',
      conversation_ref: 'conv-sdk-runtime',
      turn_ref: 'turn-browser',
      payload: {
        tool_name: 'browser',
        request_id: 'req-browser',
        parameters: { action: 'connect', url: 'https://example.test/secret-token' },
      },
    } satisfies BackendEvent);
    await tick();

    expect(sentToolResults[0]).toMatchObject({
      request_id: 'req-browser',
      success: true,
    });
    const events = await store.loadEvents('conv-sdk-runtime');
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-browser',
      path: 'browser.runtime',
    });
    expect(timeline.map(entry => `${entry.runtime}:${entry.stage}:${entry.status}`)).toEqual([
      'local-runtime:action:started',
      'local-runtime:action:succeeded',
    ]);
    expect(timeline[0].data).toEqual(expect.objectContaining({
      action: 'connect',
      argsKeyCount: 2,
    }));
    expect(timeline[1].data).toEqual(expect.objectContaining({
      action: 'connect',
      mode: 'browser_use',
      scope: 'dedicated_browser',
      connected: true,
      tabCount: 1,
      hasCurrentUrl: false,
      success: true,
    }));
    expect(JSON.stringify(timeline)).not.toContain('https://example.test');
    expect(JSON.stringify(timeline)).not.toContain('Secret Docs');
    expect(JSON.stringify(timeline)).not.toContain('Connected to secret browser page.');
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
      transport: createMockAgentRuntimeTransport({
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
      transport: createMockAgentRuntimeTransport({
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
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'tool_output',
      'turn_error',
    ]);
    const toolOutputEvent = events.find(storedEvent => storedEvent.type === 'tool_output');
    const turnErrorEvent = events.find(storedEvent => storedEvent.type === 'turn_error');
    expect(toolOutputEvent?.payload).toMatchObject({
      requestId: 'req-read',
      success: false,
      deliveryFailed: true,
      error: 'Tool result delivery failed: websocket closed',
    });
    expect(turnErrorEvent?.payload).toMatchObject({
      reason: 'tool_result_delivery_failed',
      error: 'websocket closed',
    });
    const timeline = buildTraceTimeline(events, {
      turnRef: 'turn-tool',
      path: 'tool.execution',
    });
    expect(timeline.map(entry => `${entry.stage}:${entry.status}`)).toEqual([
      'single_tool:started',
      'single_tool:failed',
    ]);
    expect(timeline[1].error).toEqual(expect.objectContaining({
      message: 'websocket closed',
    }));
    expect(timeline[1].data).toEqual(expect.objectContaining({
      deliveryFailed: true,
      success: false,
    }));
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
      transport: createMockAgentRuntimeTransport({
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
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'tool_call',
      'runtime_error',
    ]);
    expect(events[1].payload).toMatchObject({
      reason: 'malformed_tool_event',
      claimReason: 'missing-tool-name-or-request-id',
    });
    expect((await runtime.load()).state.phase).toBe('error');
  });

  test('conversation runtime records malformed bundle events without invoking local runtime', async () => {
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
      transport: createMockAgentRuntimeTransport({
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
    expect(events.filter(storedEvent => storedEvent.type !== 'trace_event').map(storedEvent => storedEvent.type)).toEqual([
      'tool_bundle_call',
      'runtime_error',
    ]);
    expect(events[1].payload).toMatchObject({
      reason: 'malformed_tool_event',
      claimReason: 'missing-bundle-id-or-tools',
    });
    expect((await runtime.load()).state.phase).toBe('error');
  });

  test('editAndResend replaces display rows before the edited user and sends normally', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const transport = createMockAgentRuntimeTransport({
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
    expect(events.map(storedEvent => storedEvent.eventId)).toEqual(expect.arrayContaining([
      'user-keep',
      'user-edit',
      'assistant-stale',
    ]));
    expect(sentQueries[0]).toMatchObject({
      text: 'new text',
      conversation_ref: 'conv-sdk-runtime',
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
    const displayTimeline = await store.loadDisplayTimeline?.({
      conversationRef: 'conv-sdk-runtime',
    });
    expect(displayTimeline).toEqual(expect.objectContaining({
      reason: 'user_edit',
      baseRevisionId: 'rev-old',
    }));
    expect(displayTimeline?.rows.map(row => row.content)).toEqual(['keep this', 'new text']);
    expect(displayTimeline?.rows[1]).toEqual(expect.objectContaining({
      id: 'turn-edited-sdk-evt-000002-user_message',
      revisionId: displayTimeline?.revisionId,
      turnRef: 'turn-edited',
      metadata: expect.objectContaining({
        replacedDisplayRowId: 'user-edit',
        revisionId: displayTimeline?.revisionId,
        sourceEventType: 'sdk-replay',
      }),
    }));
    expect((await runtime.load()).display.messages.map(message => message.text)).toEqual([
      'keep this',
      'new text',
    ]);
  });

  test('loadDisplayTimeline includes same-revision send rows after an edit replacement', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-keep',
        payload: { text: 'keep this' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-edit',
        payload: { text: 'old text' },
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
      transport: createMockAgentRuntimeTransport(),
    });

    await runtime.load();
    const baseTimeline = await runtime.loadDisplayTimeline();
    const checkpoint = await runtime.replaceRows({
      rows: baseTimeline.rows.slice(0, 1),
      reason: 'user_edit',
      baseRevisionId: baseTimeline.revisionId,
    });
    await runtime.send({
      text: 'new text',
      turnRef: 'turn-edited',
    });

    const displayTimeline = await runtime.loadDisplayTimeline();
    expect(displayTimeline.revisionId).toBe(checkpoint.revisionId);
    expect(displayTimeline.rows.map(row => row.content)).toEqual([
      'keep this',
      'new text',
    ]);
    expect(displayTimeline.rows[1]).toEqual(expect.objectContaining({
      revisionId: checkpoint.revisionId,
      turnRef: 'turn-edited',
    }));
  });

  test('editAndResend can target the original user id after a replacement row is persisted', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-old',
        eventId: 'user-edit',
        payload: { text: 'old text' },
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
      transport: createMockAgentRuntimeTransport({
        sendQuery: jest.fn(async payload => {
          sentQueries.push(payload);
          return 'query-edited';
        }),
      }),
    });

    await runtime.load();
    await runtime.editAndResend({
      messageId: 'user-edit',
      text: 'first edit',
      turnRef: 'turn-edit-one',
    });
    await runtime.editAndResend({
      messageId: 'user-edit',
      text: 'second edit',
      turnRef: 'turn-edit-two',
    });

    const displayTimeline = await runtime.loadDisplayTimeline();
    expect(sentQueries.map(query => query.text)).toEqual(['first edit', 'second edit']);
    expect(displayTimeline.rows.map(row => row.content)).toEqual(['second edit']);
    expect(displayTimeline.rows[0]).toEqual(expect.objectContaining({
      id: 'turn-edit-two-sdk-evt-000002-user_message',
      turnRef: 'turn-edit-two',
      metadata: expect.objectContaining({
        replacedDisplayRowId: 'user-edit',
      }),
    }));
  });

  test('retryTurn replaces display rows before the retried user and sends normally', async () => {
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
      transport: createMockAgentRuntimeTransport({
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
    expect(events.map(storedEvent => storedEvent.eventId)).toEqual(expect.arrayContaining([
      'user-retry',
      'tool-stale',
      'assistant-retry',
    ]));
    expect(sentQueries[0]).toMatchObject({
      text: 'try this again',
    });
    expect(sentQueries[0]).not.toHaveProperty('turn_ref');
    const displayTimeline = await store.loadDisplayTimeline?.({
      conversationRef: 'conv-sdk-runtime',
    });
    expect(displayTimeline).toEqual(expect.objectContaining({
      reason: 'retry',
      baseRevisionId: 'rev-old',
    }));
    expect(displayTimeline?.rows).toEqual([
      expect.objectContaining({
        id: 'turn-retry-sdk-evt-000002-user_message',
        content: 'try this again',
        revisionId: displayTimeline?.revisionId,
        turnRef: 'turn-retry',
        metadata: expect.objectContaining({
          replacedDisplayRowId: 'user-retry',
          revisionId: displayTimeline?.revisionId,
          sourceEventType: 'sdk-replay',
        }),
      }),
    ]);
  });

  test('editAndResend preserves ready display image attachments', async () => {
    const sentQueries: Record<string, unknown>[] = [];
    const store = new InMemoryConversationStore();
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-display',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: [
        {
          id: 'display-user-edit',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-display',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'old text',
          metadata: {
            attachments: [
              {
                id: 'artifact-one',
                kind: 'image',
                source: 'upload',
                status: 'ready',
                filename: 'one.png',
              },
              {
                id: 'artifact-two',
                kind: 'image',
                source: 'upload',
                status: 'ready',
                filename: 'two.png',
              },
            ],
          },
        },
        {
          id: 'display-assistant-stale',
          conversationRef: 'conv-sdk-runtime',
          revisionId: 'rev-display',
          index: 1,
          role: 'assistant',
          type: 'assistant_message',
          content: 'stale answer',
        },
      ],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        sendQuery: jest.fn(async payload => {
          sentQueries.push(payload);
          return 'query-edited';
        }),
      }),
    });

    await runtime.load();
    await runtime.editAndResend({
      messageId: 'display-user-edit',
      text: 'new text',
      payload: {
        screenshot_refs: null,
      },
    });

    expect(sentQueries[0]).toEqual(expect.objectContaining({
      text: 'new text',
      screenshot_refs: ['artifact-one', 'artifact-two'],
      attachment_filenames: ['one.png', 'two.png'],
    }));
  });

  test('retryTurn rejects explicit missing message ids without changing display revisions', async () => {
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
      transport: createMockAgentRuntimeTransport(),
    });

    await runtime.load();
    await expect(runtime.retryTurn({
      messageId: 'missing-assistant-message',
    })).rejects.toThrow('Cannot retry missing message: missing-assistant-message');
    const events = await store.loadEvents('conv-sdk-runtime');
    expect(events.map(storedEvent => storedEvent.eventId)).toEqual([
      'user-retry',
      'assistant-retry',
    ]);
    await expect(store.loadDisplayTimeline?.({
      conversationRef: 'conv-sdk-runtime',
    })).resolves.toBeNull();
  });

  test('rehydrate skips compacted replay installation while store snapshots expose it', async () => {
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
      transport: createMockAgentRuntimeTransport({
        rehydrateConversation: jest.fn(async payload => {
          sentRehydrates.push(payload);
        }),
      }),
    });

    const snapshot = await runtime.rehydrate();

    expect(snapshot).toMatchObject({
      messages: [],
    });
    await expect(store.loadForRehydrate('conv-sdk-runtime')).resolves.toMatchObject({
      replayGenerationId: 'gen-active',
      messages: [{ role: 'assistant', content: 'summary' }],
    });
    expect(sentRehydrates).toEqual([]);
  });

  test('conversation view projects a normal send as one SDK-owned UI view', () => {
    const events = [
      event('user_message', { text: 'hello' }),
      event('assistant_delta', { text: 'hi there' }),
    ];
    const state = events.reduce(
      (current, next) => reduceConversationRuntimeState(current, next),
      createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1'),
    );
    const currentTurn = buildCurrentTurnProjection(events);
    const view = buildConversationView({
      conversationRef: 'conv-sdk-runtime',
      revisionId: state.revisionId,
      state,
      events,
      displayRows: buildDisplayRows(events),
      currentTurn,
      pendingTurnRef: 'turn-1',
    });

    expect(view).toMatchObject({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      liveTurn: {
        turnRef: 'turn-1',
        phase: 'streaming',
        isBusy: true,
        canStop: true,
      },
      surfaces: {
        pill: { mode: 'busy' },
        dashboard: { mode: 'busy' },
        responseOverlay: {
          mode: 'response',
          visible: true,
          ownerConversationRef: 'conv-sdk-runtime',
          turnRef: 'turn-1',
        },
      },
      actions: {
        canEdit: true,
        canRetry: false,
        canFork: true,
      },
    });
    expect(view.displayRows).toEqual([
      expect.objectContaining({
        role: 'user',
        type: 'user_message',
        content: 'hello',
        actions: expect.objectContaining({
          canEdit: true,
          editTargetRowId: expect.any(String),
        }),
      }),
      expect.objectContaining({
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi there',
        isStreaming: true,
        actions: expect.objectContaining({
          canRetry: false,
          retryTargetRowId: expect.any(String),
        }),
      }),
    ]);
    expect(view.liveTurn.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'llm-text',
        text: 'hi there',
        sourceChannel: 'sdk:current-turn',
      }),
    ]));
  });

  test('conversation view does not duplicate materialized tool calls in live entries', () => {
    const events = [
      event('user_message', { text: '@script tool screenshot' }),
      event('tool_call', {
        toolName: 'screenshot',
        requestId: 'ab9a6769-5651-4fca-bada-152d4ad50b54',
        toolCallId: 'scripted_call_1',
        args: {
          explanation: 'Validate the scripted model tool path.',
        },
      }),
    ];
    const state = events.reduce(
      (current, next) => reduceConversationRuntimeState(current, next),
      createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1'),
    );
    const displayRows = buildDisplayRows(events);
    const view = buildConversationView({
      conversationRef: 'conv-sdk-runtime',
      revisionId: state.revisionId,
      state,
      events,
      displayRows,
      currentTurn: buildCurrentTurnProjection(events),
      pendingTurnRef: 'turn-1',
    });

    expect(view.displayRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_call',
        content: expect.objectContaining({
          id: 'scripted_call_1',
          name: 'screenshot',
        }),
      }),
    ]));
    expect(view.liveTurn).toMatchObject({
      turnRef: 'turn-1',
      phase: 'tool',
      isBusy: true,
    });
    expect(view.liveTurn.entries).toEqual([]);
  });

  test('conversation view keeps edit resend replacement as the live lane', () => {
    const events = [
      eventForTurn('turn-old', 'user_message', { text: 'old' }),
      eventForTurn('turn-old', 'assistant_delta', { text: 'old answer' }),
      eventForTurn('turn-old', 'turn_superseded', {
        replacementTurnRef: 'turn-new',
        reason: 'user_edit',
        createdAt: '2026-06-24T12:00:00.000Z',
      }),
      eventForTurn('turn-new', 'user_message', { text: 'new' }),
    ];
    const state = events.reduce(
      (current, next) => reduceConversationRuntimeState(current, next),
      createInitialConversationRuntimeState('conv-sdk-runtime', 'rev-1'),
    );
    const displayRows = [{
      id: 'turn-new-sdk-evt-000002-user_message',
      conversationRef: 'conv-sdk-runtime',
      turnRef: 'turn-new',
      index: 0,
      role: 'user' as const,
      type: 'user_message' as const,
      content: 'new',
      metadata: {
        eventId: 'turn-new-sdk-evt-000002-user_message',
        source: 'ui',
        revisionId: 'rev-1',
        timestamp: '2026-06-24T12:00:00.000Z',
      },
    }];
    const currentTurn = buildCurrentTurnProjection(events);
    const view = buildConversationView({
      conversationRef: 'conv-sdk-runtime',
      revisionId: state.revisionId,
      state,
      events,
      displayRows,
      currentTurn,
      pendingTurnRef: 'turn-new',
    });
    const diagnostics = buildConversationViewBuildDiagnostics({
      conversationRef: 'conv-sdk-runtime',
      revisionId: state.revisionId,
      state,
      events,
      displayRows,
      currentTurn,
      pendingTurnRef: 'turn-new',
      view,
    });

    expect(view.displayRows).toEqual([
      {
        ...displayRows[0],
        actions: {
          canEdit: true,
          editTargetRowId: 'turn-new-sdk-evt-000002-user_message',
        },
      },
    ]);
    expect(view.liveTurn).toMatchObject({
      turnRef: 'turn-new',
      phase: 'awaiting',
      isBusy: true,
      canStop: true,
    });
    expect(view.surfaces.responseOverlay).toMatchObject({
      mode: 'typing',
      guardRef: 'turn-new',
    });
    expect(diagnostics).toMatchObject({
      pendingTurnRef: 'turn-new',
      supersededTurnCount: 1,
      filteredInternalLaneCount: 0,
    });
  });

  test('conversation view exposes stable row action targets after edit replacement', () => {
    const events = [
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-new',
        source: 'sdk',
        payload: { text: 'new' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-new',
        source: 'backend',
        payload: { text: 'new answer' },
      }),
      createConversationEvent({
        type: 'turn_completed',
        conversationRef: 'conv-sdk-runtime',
        revisionId: 'rev-child',
        turnRef: 'turn-new',
        source: 'backend',
        payload: {},
      }),
    ];
    const displayRows = [
      {
        id: 'turn-new-sdk-evt-000002-user_message',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-new',
        index: 0,
        role: 'user' as const,
        type: 'user_message' as const,
        content: 'new',
        metadata: {
          eventId: 'turn-new-sdk-evt-000002-user_message',
          replacedDisplayRowId: 'turn-old-sdk-evt-000002-user_message',
          revisionId: 'rev-child',
          timestamp: '2026-06-24T12:00:00.000Z',
        },
      },
      {
        id: 'turn-new-sdk-evt-000003-assistant_message',
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-new',
        index: 1,
        role: 'assistant' as const,
        type: 'assistant_message' as const,
        content: 'new answer',
        metadata: {
          eventId: 'turn-new-sdk-evt-000003-assistant_message',
          revisionId: 'rev-child',
          timestamp: '2026-06-24T12:00:01.000Z',
        },
      },
    ];

    const view = buildConversationView({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-child',
      events,
      displayRows,
      currentTurn: buildCurrentTurnProjection(events),
    });

    expect(view.actions).toMatchObject({
      canEdit: true,
      canRetry: true,
      canFork: true,
    });
    expect(view.displayRows[0]).toMatchObject({
      actions: {
        canEdit: true,
        editTargetRowId: 'turn-old-sdk-evt-000002-user_message',
      },
    });
    expect(view.displayRows[1]).toMatchObject({
      actions: {
        canRetry: true,
        retryTargetRowId: 'turn-new-sdk-evt-000003-assistant_message',
      },
    });
  });

  test('conversation view filters internal lanes from normal UI authority', () => {
    const userEvent = eventForTurn('turn-user', 'user_message', { text: 'visible user' });
    const internalEvent = createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-agent-worker',
      revisionId: 'rev-internal',
      turnRef: 'turn-internal',
      source: 'sdk',
      payload: { text: 'internal bookkeeping' },
    });
    const events = [
      userEvent,
      internalEvent,
    ];
    const currentTurn = buildCurrentTurnProjection(events);
    expect(currentTurn.conversationRef).toBe('conv-agent-worker');

    const view = buildConversationView({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      events,
      displayRows: buildDisplayRows(events),
      currentTurn,
    });
    const diagnostics = buildConversationViewBuildDiagnostics({
      conversationRef: 'conv-sdk-runtime',
      revisionId: 'rev-1',
      events,
      displayRows: buildDisplayRows(events),
      currentTurn,
      view,
    });

    expect(view.conversationRef).toBe('conv-sdk-runtime');
    expect(view.displayRows).toEqual([
      expect.objectContaining({
        conversationRef: 'conv-sdk-runtime',
        turnRef: 'turn-user',
        content: 'visible user',
      }),
    ]);
    expect(view.liveTurn).toMatchObject({
      turnRef: 'turn-user',
      phase: 'awaiting',
      isBusy: true,
    });
    expect(view.surfaces.responseOverlay.ownerConversationRef).toBe('conv-sdk-runtime');
    expect(diagnostics.filteredInternalLaneCount).toBe(1);
  });

  test('conversation view keeps internal-only lanes hidden from normal surfaces', () => {
    const internalEvent = createConversationEvent({
      type: 'user_message',
      conversationRef: 'conv-agent-worker',
      revisionId: 'rev-internal',
      turnRef: 'turn-internal',
      source: 'sdk',
      payload: { text: 'internal bookkeeping' },
    });
    const events = [internalEvent];
    const currentTurn = buildCurrentTurnProjection(events);
    const view = buildConversationView({
      conversationRef: 'conv-agent-worker',
      revisionId: 'rev-internal',
      events,
      displayRows: buildDisplayRows(events),
      currentTurn,
    });

    expect(currentTurn.conversationRef).toBe('conv-agent-worker');
    expect(view).toMatchObject({
      conversationRef: 'conv-agent-worker',
      displayRows: [],
      liveTurn: {
        turnRef: null,
        phase: 'idle',
        entries: [],
        isBusy: false,
        canStop: false,
      },
      surfaces: {
        pill: { mode: 'idle' },
        dashboard: { mode: 'idle' },
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          ownerConversationRef: 'conv-agent-worker',
          turnRef: null,
        },
      },
    });
  });
});
