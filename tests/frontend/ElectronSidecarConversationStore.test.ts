import {
  buildRehydrateSnapshotFromTranscriptProjectionEntries,
  ElectronSidecarConversationStore,
  SDK_CONVERSATION_EVENT_RECORD_KIND,
} from '../../frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore';
import {
  listStoredConversations,
  loadStoredConversationEntries,
} from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  createConversationEvent,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
  listStoredConversations: jest.fn(),
  loadStoredConversationEntries: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    DELETE_CONVERSATION: 'delete-conversation',
    STORE_TRANSCRIPT: 'store-transcript',
  },
}));

const mockListStoredConversations = listStoredConversations as jest.MockedFunction<typeof listStoredConversations>;
const mockLoadStoredConversationEntries = loadStoredConversationEntries as jest.MockedFunction<typeof loadStoredConversationEntries>;
const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

function sdkEventRow(event: ReturnType<typeof createConversationEvent>) {
  return {
    metadata: {
      structured_payload: {
        windieSdkConversationEvent: event,
      },
    },
  } as any;
}

describe('ElectronSidecarConversationStore', () => {
  beforeEach(() => {
    mockListStoredConversations.mockReset();
    mockLoadStoredConversationEntries.mockReset();
    mockInvoke.mockReset();
    mockListStoredConversations.mockResolvedValue([]);
    mockLoadStoredConversationEntries.mockResolvedValue([]);
    mockInvoke.mockResolvedValue({ success: true, data: { message_index: 1 } });
  });

  test('stores normalized SDK events under the conversation-event record kind', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    const event = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'hello' },
    });

    await store.appendEvent(event);

    expect(mockInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'hello',
      conversationRef: 'conv-1',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      role: 'user',
      messageType: 'user_message',
      structuredPayload: {
        windieSdkConversationEvent: event,
      },
    }));
  });

  test('uses SDK tool identity helpers when storing SDK tool events', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
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

    expect(mockInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      correlationId: 'call-read',
      messageType: 'tool_output',
      structuredPayload: {
        windieSdkConversationEvent: event,
      },
    }));
  });

  test('loads only canonical SDK event rows', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'from sdk event' },
    });
    mockLoadStoredConversationEntries.mockResolvedValueOnce([sdkEventRow(event)]);

    const events = await store.loadEvents('conv-1');

    expect(events).toEqual([event]);
    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(1);
    expect(mockLoadStoredConversationEntries).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    }));
  });

  test('preserves sidecar append order for same-timestamp SDK event rows', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
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
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      { message_index: 1, ...sdkEventRow(first) },
      { message_index: 2, ...sdkEventRow(second) },
    ]);

    expect((await store.loadEvents('conv-1')).map((event) => event.eventId)).toEqual([
      'z-first',
      'a-second',
    ]);
  });

  test('stores compacted replay snapshots as compaction events', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });

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
    expect(mockInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      userId: 'user-1',
      conversationRef: 'conv-compact',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      messageType: 'compaction_applied',
      structuredPayload: {
        windieSdkConversationEvent: expect.objectContaining({
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
      },
    }));
  });

  test('uses the newest complete compaction event for backend rehydrate snapshots', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
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
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
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
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });

    await store.appendTranscriptProjectionEntry({
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

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'assistant answer',
      userId: 'user-1',
      conversationRef: 'conv-append',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      role: 'assistant',
      messageType: 'assistant_message',
      structuredPayload: {
        windieSdkConversationEvent: expect.objectContaining({
          type: 'assistant_message',
          payload: expect.objectContaining({
            text: 'assistant answer',
            structuredPayload: expect.objectContaining({
              content: 'assistant answer',
            }),
          }),
        }),
      },
    }));
  });

  test('rewrite deletes canonical event rows before storing the new revision projection', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
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

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-edit',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'store-transcript', expect.objectContaining({
      conversationRef: 'conv-edit',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      structuredPayload: {
        windieSdkConversationEvent: preserved,
      },
    }));
  });

  test('deletes only canonical event rows for a conversation', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });

    await store.deleteConversation('conv-delete');

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-delete',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    });
  });

  test('rewrites transcript projection as canonical events', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });

    const rehydrateSnapshot = await store.rewriteTranscriptProjection({
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

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-edit',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'store-transcript', expect.objectContaining({
      content: 'edited prompt',
      userId: 'user-1',
      conversationRef: 'conv-edit',
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      role: 'user',
      messageType: 'user_message',
    }));
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'store-transcript', expect.objectContaining({
      content: 'tool output',
      role: 'tool',
      messageType: 'tool_output',
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
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockListStoredConversations.mockResolvedValueOnce([
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
      },
    ]);
    expect(mockListStoredConversations).toHaveBeenCalledTimes(1);
    expect(mockListStoredConversations).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      limit: null,
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
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockListStoredConversations.mockResolvedValueOnce([
      {
        conversation_id: 'conv-1',
        title: 'First',
        last_timestamp: '2026-05-15T11:00:00.000Z',
        entry_count: 1,
      } as any,
    ]);

    const metadata = await store.listMetadata({ limit: 1 });

    expect(metadata.map((entry) => entry.conversationRef)).toEqual(['conv-1']);
    expect(mockListStoredConversations).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      limit: 1,
    }));
  });

  test('applies metadata cursor pagination to canonical event rows', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockListStoredConversations.mockResolvedValueOnce([
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
    expect(mockListStoredConversations).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      limit: null,
    }));
  });
});
