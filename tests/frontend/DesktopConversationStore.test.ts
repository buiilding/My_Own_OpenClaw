import {
  buildRehydrateSnapshotFromTranscriptProjectionEntries,
  CHAT_EVENT_RECORD_KIND,
  appendTranscriptProjectionEntry,
  createDesktopConversationStore,
  rewriteTranscriptProjection,
} from '../../frontend/src/renderer/infrastructure/transcript/desktopConversationStore';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  createConversationEvent,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    DELETE_CHAT_CONVERSATION: 'delete-chat-conversation',
    GET_CHAT_EVENTS: 'get-chat-events',
    LIST_CHAT_CONVERSATIONS: 'list-chat-conversations',
    SEARCH_CHAT_CONVERSATIONS: 'search-chat-conversations',
    STORE_CHAT_EVENT: 'store-chat-event',
  },
}));

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

function sdkEventRow(event: ReturnType<typeof createConversationEvent>) {
  return {
    event_payload: event,
  } as any;
}

function mockGetChatEventsOnce(events: Array<Record<string, unknown>>) {
  mockInvoke.mockImplementationOnce(async (channel) => {
    if (channel === 'get-chat-events') {
      return {
        success: true,
        data: { events },
      };
    }
    return { success: true, data: { message_index: 1 } };
  });
}

function mockListConversationsOnce(conversations: Array<Record<string, unknown>>) {
  mockInvoke.mockImplementationOnce(async (channel) => {
    if (channel === 'list-chat-conversations') {
      return {
        success: true,
        data: { conversations },
      };
    }
    return { success: true, data: { message_index: 1 } };
  });
}

describe('desktop conversation store factory', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'get-chat-events') {
        return { success: true, data: { events: [] } };
      }
      if (channel === 'list-chat-conversations') {
        return { success: true, data: { conversations: [] } };
      }
      if (channel === 'search-chat-conversations') {
        return { success: true, data: { conversations: [] } };
      }
      return { success: true, data: { message_index: 1 } };
    });
  });

  test('stores normalized SDK events in dedicated chat-event storage', async () => {
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

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      content: 'hello',
      conversationId: 'conv-1',
      eventType: 'user_message',
      role: 'user',
      eventPayload: event,
    }));
  });

  test('stores user-message image attachments as first-class chat event attachments', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-user-image',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        text: 'look at this',
        screenshots: [
          {
            screenshotRef: 'artifact-user-1',
            screenshotUrl: '/api/artifacts/artifact-user-1',
            screenshotContentType: 'image/png',
          },
        ],
      },
    });

    await store.appendEvent(event);

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      attachments: [
        expect.objectContaining({
          kind: 'image',
          ref: 'artifact-user-1',
          url: '/api/artifacts/artifact-user-1',
          contentType: 'image/png',
        }),
      ],
      eventPayload: event,
    }));
  });

  test('uses SDK tool identity helpers when storing SDK tool events', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-tool',
      type: 'tool_output',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        text: 'tool result',
        toolCallId: 'call-read',
        correlationId: 'corr-read',
      },
    });

    await store.appendEvent(event);

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      correlationId: 'call-read',
      eventType: 'tool_output',
      eventPayload: event,
    }));
  });

  test('stores tool-output image attachments from nested result payloads', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-tool-image',
      type: 'tool_output',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        text: 'tool result',
        toolCallId: 'call-shot',
        result: {
          screenshot_ref: 'artifact-tool-1',
          screenshot_url: '/api/artifacts/artifact-tool-1',
          screenshot_content_type: 'image/png',
        },
      },
    });

    await store.appendEvent(event);

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      attachments: [
        expect.objectContaining({
          kind: 'image',
          ref: 'artifact-tool-1',
          url: '/api/artifacts/artifact-tool-1',
          contentType: 'image/png',
        }),
      ],
      eventPayload: event,
    }));
  });

  test('loads only canonical SDK event rows', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'from sdk event' },
    });
    mockGetChatEventsOnce([sdkEventRow(event)]);

    const events = await store.loadEvents('conv-1');

    expect(events).toEqual([event]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('get-chat-events', expect.objectContaining({
      recordKind: CHAT_EVENT_RECORD_KIND,
    }));
  });

  test('preserves sidecar append order for same-timestamp SDK event rows', async () => {
    const store = createDesktopConversationStore('user-1');
    const timestamp = '2026-05-15T12:00:00.000Z';
    const first = createConversationEvent({
      eventId: 'z-first',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp,
      payload: { text: 'first in append order' },
    });
    const second = createConversationEvent({
      eventId: 'a-second',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp,
      payload: { text: 'second in append order' },
    });
    mockGetChatEventsOnce([
      { message_index: 1, ...sdkEventRow(first) },
      { message_index: 2, ...sdkEventRow(second) },
    ]);

    expect((await store.loadEvents('conv-1')).map((event) => event.eventId)).toEqual([
      'z-first',
      'a-second',
    ]);
  });

  test('stores compacted replay snapshots as compaction events', async () => {
    const store = createDesktopConversationStore('user-1');

    await store.replaceCompactedReplay({
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
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      userId: 'user-1',
      conversationId: 'conv-compact',
      eventType: 'compaction_applied',
      compactionCheckpoint: expect.objectContaining({
        generationId: 'gen-1',
      }),
      eventPayload: expect.objectContaining({
        eventId: 'compaction-gen-1',
        type: 'compaction_applied',
        revisionId: 'rev-source',
        turnRef: 'turn-compact',
        payload: expect.objectContaining({
          generationId: 'gen-1',
          entries: [
            expect.objectContaining({ content: 'compacted summary' }),
          ],
          entryCount: 1,
          complete: true,
        }),
      }),
    }));
  });

  test('uses the newest complete compaction event for backend rehydrate snapshots', async () => {
    const store = createDesktopConversationStore('user-1');
    const partial = createConversationEvent({
      eventId: 'compaction-partial',
      type: 'compaction_applied',
      conversationRef: 'conv-compact',
      revisionId: 'rev-partial',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        generationId: 'gen-partial',
        sourceRevisionId: 'rev-partial',
        entries: [{ role: 'assistant', content: 'partial' }],
        entryCount: 2,
        complete: true,
      },
    });
    const complete = createConversationEvent({
      eventId: 'compaction-complete',
      type: 'compaction_applied',
      conversationRef: 'conv-compact',
      revisionId: 'rev-new',
      timestamp: '2026-05-15T12:01:00.000Z',
      payload: {
        generationId: 'gen-new',
        sourceRevisionId: 'rev-new',
        entries: [{ role: 'assistant', content: 'new complete' }],
        entryCount: 1,
        complete: true,
      },
    });
    mockGetChatEventsOnce([
      sdkEventRow(partial),
      sdkEventRow(complete),
    ]);

    const snapshot = await store.loadForRehydrate('conv-compact');

    expect(snapshot).toMatchObject({
      replayGenerationId: 'gen-new',
      revisionId: 'rev-new',
      messages: [
        expect.objectContaining({ content: 'new complete' }),
      ],
    });
  });

  test('appends transcript projections as canonical conversation events', async () => {
    await appendTranscriptProjectionEntry('user-1', {
      conversationRef: 'conv-append',
      content: 'assistant answer',
      role: 'assistant',
      messageType: 'llm-text',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      screenshot: 'artifact-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      rehydrateEntry: {
        role: 'assistant',
        content: 'assistant answer',
        message_type: 'llm-text',
      },
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenLastCalledWith('store-chat-event', expect.objectContaining({
      content: 'assistant answer',
      userId: 'user-1',
      conversationId: 'conv-append',
      eventType: 'assistant_message',
      role: 'assistant',
      eventPayload: expect.objectContaining({
        type: 'assistant_message',
        payload: expect.objectContaining({
          text: 'assistant answer',
          structuredPayload: expect.objectContaining({
            content: 'assistant answer',
          }),
        }),
      }),
    }));
  });

  test('classifies hyphenated transcript tool-call rows as SDK tool events', async () => {
    await appendTranscriptProjectionEntry('user-1', {
      conversationRef: 'conv-tool-call',
      content: '{"id":"call-1","name":"mouse_control","arguments":{"action":"click"}}',
      role: 'assistant',
      messageType: 'tool-call',
      toolName: 'mouse_control',
      correlationId: 'call-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      rehydrateEntry: {
        role: 'assistant',
        content: '{"id":"call-1","name":"mouse_control","arguments":{"action":"click"}}',
        message_type: 'tool-call',
      },
    });

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      content: '{"id":"call-1","name":"mouse_control","arguments":{"action":"click"}}',
      role: 'assistant',
      eventType: 'tool_call',
      toolName: 'mouse_control',
      correlationId: 'call-1',
      eventPayload: expect.objectContaining({
        type: 'tool_call',
        payload: expect.objectContaining({
          messageType: 'tool-call',
          toolName: 'mouse_control',
          toolCallId: 'call-1',
        }),
      }),
    }));
  });

  test('classifies hyphenated transcript tool-output rows as SDK tool events', async () => {
    await appendTranscriptProjectionEntry('user-1', {
      conversationRef: 'conv-tool-output',
      content: 'clicked',
      role: 'tool',
      messageType: 'tool-output',
      toolName: 'mouse_control',
      correlationId: 'call-1',
      screenshot: 'artifact-output-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      rehydrateEntry: {
        role: 'tool',
        content: 'clicked',
        message_type: 'tool-output',
      },
    });

    expect(mockInvoke).toHaveBeenCalledWith('store-chat-event', expect.objectContaining({
      content: 'clicked',
      role: 'tool',
      eventType: 'tool_output',
      toolName: 'mouse_control',
      correlationId: 'call-1',
      eventPayload: expect.objectContaining({
        type: 'tool_output',
      }),
    }));
  });

  test('rewrite deletes canonical event rows before storing the new revision projection', async () => {
    const store = createDesktopConversationStore('user-1');
    const preserved = createConversationEvent({
      eventId: 'evt-preserved',
      type: 'user_message',
      conversationRef: 'conv-edit',
      revisionId: 'rev-next',
      payload: { text: 'edited' },
    });

    await store.rewriteConversation({
      conversationRef: 'conv-edit',
      baseRevisionId: 'rev-old',
      newRevisionId: 'rev-next',
      preservedEvents: [preserved],
      removedEventIds: ['evt-old'],
      reason: 'edit_resend',
      replacementUserMessage: { text: 'edited' },
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-chat-conversation', expect.objectContaining({
      userId: 'user-1',
      conversationId: 'conv-edit',
      recordKind: CHAT_EVENT_RECORD_KIND,
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'store-chat-event', expect.objectContaining({
      conversationId: 'conv-edit',
      eventPayload: preserved,
    }));
  });

  test('deletes only canonical event rows for a conversation', async () => {
    const store = createDesktopConversationStore('user-1');

    await store.deleteConversation('conv-delete');

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('delete-chat-conversation', expect.objectContaining({
      userId: 'user-1',
      conversationId: 'conv-delete',
      recordKind: CHAT_EVENT_RECORD_KIND,
    }));
  });

  test('rewrites transcript projection as canonical events', async () => {
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

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-chat-conversation', expect.objectContaining({
      userId: 'user-1',
      conversationId: 'conv-edit',
      recordKind: CHAT_EVENT_RECORD_KIND,
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'store-chat-event', expect.objectContaining({
      content: 'edited prompt',
      userId: 'user-1',
      conversationId: 'conv-edit',
      role: 'user',
      eventType: 'user_message',
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'store-chat-event', expect.objectContaining({
      content: 'tool output',
      role: 'tool',
      eventType: 'tool_output',
      toolName: 'shell',
      correlationId: 'tool-call-1',
    }));
    expect(rehydrateSnapshot.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'previous context',
      }),
    ]);
  });

  test('lists metadata from canonical event rows only', async () => {
    const store = createDesktopConversationStore('user-1');
    mockListConversationsOnce([
      {
        conversation_id: 'conv-sdk',
        title: 'SDK title',
        last_message: 'latest',
        last_timestamp: '2026-05-15T12:00:00.000Z',
        entry_count: 3,
        workspace_path: '/work/WindieOS',
        workspace_name: 'WindieOS',
      } as any,
    ]);

    const metadata = await store.listMetadata();

    expect(metadata).toEqual([
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
    ]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('list-chat-conversations', expect.objectContaining({
      recordKind: CHAT_EVENT_RECORD_KIND,
      limit: undefined,
    }));
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

  test('applies explicit metadata limits to canonical event rows', async () => {
    const store = createDesktopConversationStore('user-1');
    mockListConversationsOnce([
      {
        conversation_id: 'conv-1',
        title: 'First',
        last_timestamp: '2026-05-15T11:00:00.000Z',
        entry_count: 1,
      } as any,
    ]);

    const metadata = await store.listMetadata({ limit: 1 });

    expect(metadata.map((entry) => entry.conversationRef)).toEqual(['conv-1']);
    expect(mockInvoke).toHaveBeenCalledWith('list-chat-conversations', expect.objectContaining({
      recordKind: CHAT_EVENT_RECORD_KIND,
      limit: 1,
    }));
  });

  test('applies metadata cursor pagination to canonical event rows', async () => {
    const store = createDesktopConversationStore('user-1');
    mockListConversationsOnce([
      {
        conversation_id: 'conv-1',
        title: 'First',
        last_timestamp: '2026-05-15T10:00:00.000Z',
        entry_count: 1,
      } as any,
      {
        conversation_id: 'conv-2',
        title: 'Second',
        last_timestamp: '2026-05-15T11:00:00.000Z',
        entry_count: 1,
      } as any,
      {
        conversation_id: 'conv-3',
        title: 'Third',
        last_timestamp: '2026-05-15T12:00:00.000Z',
        entry_count: 1,
      } as any,
    ]);

    const metadata = await store.listMetadata({ cursor: 'conv-3', limit: 1 });

    expect(metadata.map((entry) => entry.conversationRef)).toEqual(['conv-2']);
    expect(mockInvoke).toHaveBeenCalledWith('list-chat-conversations', expect.objectContaining({
      recordKind: CHAT_EVENT_RECORD_KIND,
      limit: undefined,
    }));
  });
});
