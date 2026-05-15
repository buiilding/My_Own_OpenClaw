import {
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

describe('ElectronSidecarConversationStore', () => {
  beforeEach(() => {
    mockListStoredConversations.mockReset();
    mockLoadStoredConversationEntries.mockReset();
    mockInvoke.mockReset();
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

  test('loads canonical SDK events before falling back to legacy transcript rows', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'from sdk event' },
    });
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      {
        metadata: {
          structured_payload: {
            windieSdkConversationEvent: event,
          },
        },
      } as any,
    ]);

    const events = await store.loadEvents('conv-1');

    expect(events).toEqual([event]);
    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(1);
    expect(mockLoadStoredConversationEntries).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    }));
  });

  test('projects legacy transcript rows into SDK events when no canonical event rows exist', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'row-user',
          role: 'user',
          content: 'legacy hello',
          message_type: 'user',
          timestamp: '2026-05-15T12:00:00.000Z',
        } as any,
      ]);

    const events = await store.loadEvents('conv-legacy');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      eventId: 'row-user',
      type: 'user_message',
      conversationRef: 'conv-legacy',
      payload: expect.objectContaining({
        text: 'legacy hello',
      }),
    }));
  });

  test('uses complete replay rows for backend rehydrate snapshots', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      {
        timestamp: '2026-05-15T12:00:00.000Z',
        metadata: {
          rehydrate_entry: {
            role: 'assistant',
            content: 'compacted',
            replay_generation_id: 'gen-1',
            replay_source_revision_id: 'rev-source',
          },
        },
      } as any,
    ]);

    const snapshot = await store.loadForRehydrate('conv-compact');

    expect(snapshot).toEqual({
      conversationRef: 'conv-compact',
      revisionId: 'rev-source',
      messages: [
        expect.objectContaining({
          role: 'assistant',
          content: 'compacted',
        }),
      ],
      replayGenerationId: 'gen-1',
    });
  });

  test('rewrite deletes only canonical event rows before storing the new revision projection', async () => {
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

  test('lists conversation-event metadata and falls back to transcript metadata only when needed', async () => {
    const store = new ElectronSidecarConversationStore({ userId: 'user-1' });
    mockListStoredConversations.mockResolvedValueOnce([
      {
        conversation_id: 'conv-sdk',
        title: 'SDK title',
        last_message: 'latest',
        last_timestamp: '2026-05-15T12:00:00.000Z',
        entry_count: 3,
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
      },
    ]);
    expect(mockListStoredConversations).toHaveBeenCalledTimes(1);
    expect(mockListStoredConversations).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
    }));
  });
});
