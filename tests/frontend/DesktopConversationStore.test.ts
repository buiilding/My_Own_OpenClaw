/**
 * Covers desktop conversation store. behavior in the frontend test suite.
 */

import {
  buildRehydrateSnapshotFromTranscriptProjectionEntries,
  appendTranscriptProjectionEntry,
  createDesktopConversationStore,
  loadDesktopTraceTimeline,
  rewriteTranscriptProjection,
} from '../../frontend/src/renderer/infrastructure/transcript/desktopConversationStore';
import {
  createConversationEvent,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';
import { invokeWindieCommand } from '../../frontend/src/renderer/app/runtime/windieCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => ({
  invokeWindieCommand: jest.fn(),
}));

const mockInvokeWindieCommand = invokeWindieCommand as jest.MockedFunction<typeof invokeWindieCommand>;

const defaultRevision = {
  conversationRef: 'conv-1',
  revisionId: 'rev-stored-test',
  updatedAt: '1970-01-01T00:00:00.000Z',
};

describe('desktop conversation store factory', () => {
  beforeEach(() => {
    mockInvokeWindieCommand.mockReset();
    mockInvokeWindieCommand.mockImplementation(async (command, payload) => {
      if (command === 'conversation.getRevision') {
        return {
          ...defaultRevision,
          conversationRef: String(payload?.conversationRef || defaultRevision.conversationRef),
        } as never;
      }
      if (command === 'conversation.load') {
        return {
          state: { events: [] },
          display: {
            conversationRef: String(payload?.conversationRef || 'conv-1'),
            revisionId: 'rev-load',
            messages: [],
            compaction: { status: 'idle' },
          },
          displayRows: [],
          rehydrate: {
            conversationRef: String(payload?.conversationRef || 'conv-1'),
            revisionId: 'rev-load',
            messages: [],
          },
        } as never;
      }
      if (command === 'conversations.list' || command === 'conversations.search') {
        return [] as never;
      }
      return null as never;
    });
  });

  test('appends canonical SDK events through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'hello' },
    });

    await store.appendEvent(event);

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.appendEvent', {
      userId: 'user-1',
      conversationRef: 'conv-1',
      event,
    });
  });

  test('loads events through the SDK conversation load command', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'from sdk event' },
    });
    mockInvokeWindieCommand.mockResolvedValueOnce({
      state: { events: [event] },
    } as never);

    const events = await store.loadEvents('conv-1');

    expect(events).toEqual([event]);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.load', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('loads durable trace timelines through the SDK conversation load command', async () => {
    const traceEvent = createConversationEvent({
      eventId: 'evt-trace',
      type: 'trace_event',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        schemaVersion: 1,
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: null,
        path: 'memory.retrieval',
        stage: 'retrieval',
        status: 'succeeded',
        runtime: 'sdk',
      },
    });
    const visibleEvent = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      payload: { text: 'hello' },
    });
    mockInvokeWindieCommand.mockResolvedValueOnce({
      state: { events: [visibleEvent, traceEvent] },
    } as never);

    const timeline = await loadDesktopTraceTimeline('user-1', 'conv-1', {
      turnRef: 'turn-1',
      path: 'memory.retrieval',
    });

    expect(timeline).toEqual([
      expect.objectContaining({
        eventId: 'evt-trace',
        traceId: 'trace-1',
        path: 'memory.retrieval',
        status: 'succeeded',
      }),
    ]);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.load', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('stores compacted replay snapshots through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const snapshot = {
      generationId: 'gen-1',
      conversationRef: 'conv-compact',
      sourceRevisionId: 'rev-source',
      sourceTurnRef: 'turn-compact',
      createdAt: '2026-05-15T12:00:00.000Z',
      entries: [
        {
          role: 'assistant',
          content: 'compacted summary',
          message_type: 'context_compaction',
        },
      ],
      entryCount: 1,
      complete: true,
      active: true,
    };

    await store.replaceCompactedReplay(snapshot);

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.replaceCompactedReplay', {
      userId: 'user-1',
      conversationRef: 'conv-compact',
      snapshot,
    });
  });

  test('appends transcript projections as enriched canonical conversation events', async () => {
    await appendTranscriptProjectionEntry('user-1', {
      conversationRef: 'conv-append',
      content: 'assistant answer',
      role: 'assistant',
      messageType: 'llm-text',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      screenshotRef: 'artifact-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      rehydrateEntry: {
        role: 'assistant',
        content: 'assistant answer',
        message_type: 'llm-text',
      },
    });

    expect(mockInvokeWindieCommand).toHaveBeenCalledTimes(2);
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'conversation.getRevision', {
      userId: 'user-1',
      conversationRef: 'conv-append',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'conversation.appendEvent', {
      userId: 'user-1',
      conversationRef: 'conv-append',
      event: expect.objectContaining({
        type: 'assistant_message',
        conversationRef: 'conv-append',
        revisionId: 'rev-stored-test',
        payload: expect.objectContaining({
          text: 'assistant answer',
          screenshotRef: 'artifact-1',
          screenshot: null,
          metadata: expect.objectContaining({
            model_id: 'model-1',
            model_provider: 'provider-1',
            screenshot: 'artifact-1',
          }),
          attachments: [
            expect.objectContaining({
              kind: 'image',
              ref: 'artifact-1',
            }),
          ],
          structuredPayload: expect.objectContaining({
            content: 'assistant answer',
          }),
        }),
      }),
    });
  });

  test('classifies hyphenated transcript tool rows as SDK tool events', async () => {
    await appendTranscriptProjectionEntry('user-1', {
      conversationRef: 'conv-tool-output',
      content: 'clicked',
      role: 'tool',
      messageType: 'tool-output',
      toolName: 'mouse_control',
      correlationId: 'call-1',
      screenshotRef: 'artifact-output-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      rehydrateEntry: {
        role: 'tool',
        content: 'clicked',
        message_type: 'tool-output',
      },
    });

    expect(mockInvokeWindieCommand).toHaveBeenLastCalledWith('conversation.appendEvent', {
      userId: 'user-1',
      conversationRef: 'conv-tool-output',
      event: expect.objectContaining({
        type: 'tool_output',
        payload: expect.objectContaining({
          text: 'clicked',
          toolName: 'mouse_control',
          correlationId: 'call-1',
          toolCallId: 'call-1',
          screenshotRef: 'artifact-output-1',
          screenshot: null,
        }),
      }),
    });
  });

  test('rewrites edit plans through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const preserved = createConversationEvent({
      eventId: 'evt-rewrite',
      type: 'conversation_rewritten',
      conversationRef: 'conv-edit',
      revisionId: 'rev-next',
      payload: { reason: 'edit_resend' },
    });
    const plan = {
      conversationRef: 'conv-edit',
      baseRevisionId: 'rev-old',
      newRevisionId: 'rev-next',
      cutAfterEventId: 'evt-prior',
      preservedEvents: [preserved],
      removedEventIds: ['evt-old'],
      reason: 'edit_resend' as const,
      replacementUserMessage: { text: 'edited' },
    };

    await store.rewriteConversation(plan);

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.rewrite', {
      userId: 'user-1',
      conversationRef: 'conv-edit',
      plan,
    });
  });

  test('deletes conversations through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');

    await store.deleteConversation('conv-delete');

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-delete',
    });
  });

  test('rewrites transcript projection as canonical SDK events', async () => {
    const rehydrateSnapshot = await rewriteTranscriptProjection({
      userId: 'user-1',
      conversationRef: 'conv-edit',
      entries: [
        {
          content: 'edited prompt',
          role: 'user',
          messageType: 'user',
          screenshot: 'artifact-1',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
        {
          content: 'tool output',
          role: 'tool',
          messageType: 'tool_output',
          toolName: 'shell',
          correlationId: 'tool-call-1',
        },
      ],
      rehydrateEntries: [
        {
          content: 'previous context',
          role: 'user',
          messageType: 'user',
        },
      ],
    });

    expect(mockInvokeWindieCommand).toHaveBeenCalledTimes(1);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.rewrite', {
      userId: 'user-1',
      conversationRef: 'conv-edit',
      plan: expect.objectContaining({
        conversationRef: 'conv-edit',
        reason: 'transcript_projection_rewrite',
        preservedEvents: [
          expect.objectContaining({
            type: 'user_message',
          payload: expect.objectContaining({
            text: 'edited prompt',
            attachments: [
              expect.objectContaining({
                kind: 'image',
                data: 'artifact-1',
              }),
            ],
          }),
          }),
          expect.objectContaining({
            type: 'tool_output',
            payload: expect.objectContaining({
              text: 'tool output',
              toolName: 'shell',
              correlationId: 'tool-call-1',
            }),
          }),
        ],
      }),
    });
    expect(rehydrateSnapshot.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'previous context',
      }),
    ]);
  });

  test('lists metadata through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const metadata = [
      {
        conversationRef: 'conv-sdk',
        revisionId: 'rev-stored-conv-sdk',
        title: 'SDK title',
        lastMessage: 'latest',
        updatedAt: '2026-05-15T12:00:00.000Z',
        eventCount: 3,
        workspacePath: '/work/WindieOS',
        workspaceName: 'WindieOS',
        snippet: null,
        matchedRole: null,
      },
    ];
    mockInvokeWindieCommand.mockResolvedValueOnce(metadata as never);

    await expect(store.listMetadata({ limit: 25 })).resolves.toEqual(metadata);
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.list', {
      userId: 'user-1',
      limit: 25,
    });
  });

  test('builds replay rehydrate snapshots from transcript projection entries through SDK projections', () => {
    const snapshot = buildRehydrateSnapshotFromTranscriptProjectionEntries({
      conversationRef: 'conv-replay',
      entries: [
        {
          content: 'previous prompt',
          role: 'user',
          messageType: 'user',
          timestamp: '2026-05-15T12:00:00.000Z',
        },
        {
          content: '{"name":"read_file"}',
          role: 'assistant',
          messageType: 'tool_call',
          toolName: 'read_file',
          correlationId: 'call-read',
          timestamp: '2026-05-15T12:00:01.000Z',
        },
      ],
    });

    expect(snapshot).toMatchObject({
      conversationRef: 'conv-replay',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'previous prompt',
        }),
      ],
    });
    expect(snapshot.messages).toHaveLength(1);
  });
});
