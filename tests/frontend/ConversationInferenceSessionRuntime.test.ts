import { loadLocalConversationSnapshot } from '../../frontend/src/renderer/infrastructure/transcript/conversationLocalSnapshotLoader';
import { DesktopConversationRuntimeClient } from '../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient';
import {
  clearConversationInferenceSessionState,
  ensureConversationInferenceSessionHydrated,
  getConversationInferenceSessionState,
  invalidateConversationInferenceSessionState,
  markConversationInferenceSessionLocalOnly,
  markConversationInferenceSessionUnknown,
  rehydrateConversationInferenceSession,
} from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

jest.mock('../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient', () => ({
  DesktopConversationRuntimeClient: {
    loadRehydrateSnapshot: jest.fn(),
    rehydrate: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationLocalSnapshotLoader', () => ({
  loadLocalConversationSnapshot: jest.fn(),
}));

const mockDesktopRuntime = DesktopConversationRuntimeClient as jest.Mocked<typeof DesktopConversationRuntimeClient>;
const mockLoadLocalConversationSnapshot = loadLocalConversationSnapshot as jest.MockedFunction<typeof loadLocalConversationSnapshot>;

function mockLocalSnapshot() {
  mockLoadLocalConversationSnapshot.mockResolvedValue({
    transcriptEntries: [],
    replayEntries: [],
    workspaceBinding: {
      workspacePath: '',
      workspaceName: '',
    },
    parsedMessages: [],
    rehydrateMessages: [],
  });
}

describe('conversationInferenceSessionRuntime', () => {
  beforeEach(() => {
    invalidateConversationInferenceSessionState();
    mockDesktopRuntime.rehydrate.mockReset();
    mockDesktopRuntime.loadRehydrateSnapshot.mockReset();
    mockLoadLocalConversationSnapshot.mockReset();
    mockLocalSnapshot();
  });

  test('lazy rehydrates an unknown existing conversation once and then treats it as synced', async () => {
    markConversationInferenceSessionUnknown('conv-existing');
    mockDesktopRuntime.loadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-existing',
      revisionId: 'rev-1',
      messages: [
        {
          role: 'user',
          content: 'hello',
          message_type: 'user',
          metadata: {},
        } as any,
      ],
      compactedReplay: null,
      toolTrace: { calls: [] },
      compaction: { status: 'none' },
    } as any);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });
    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });

    expect(mockLoadLocalConversationSnapshot).toHaveBeenCalledTimes(1);
    expect(mockLoadLocalConversationSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: 'conversation_event',
    }));
    expect(mockDesktopRuntime.loadRehydrateSnapshot).toHaveBeenCalledTimes(1);
    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledTimes(1);
    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'hello',
          message_type: 'user',
        }),
      ],
      workspacePath: null,
    }));
    expect(getConversationInferenceSessionState('conv-existing')).toBe('hydrated');
  });

  test('uses runtime rehydrate snapshots when available', async () => {
    markConversationInferenceSessionUnknown('conv-replay-preferred');
    mockDesktopRuntime.loadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-replay-preferred',
      revisionId: 'rev-1',
      messages: [
        {
          role: 'assistant',
          content: 'compacted replay',
          message_type: 'context_compaction',
        } as any,
      ],
      compactedReplay: null,
      toolTrace: { calls: [] },
      compaction: { status: 'none' },
    } as any);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-replay-preferred',
      userId: 'user-1',
    });

    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay-preferred',
      messages: [
        expect.objectContaining({
          role: 'assistant',
          content: 'compacted replay',
          message_type: 'context_compaction',
        }),
      ],
      workspacePath: null,
    }));
  });

  test('uses canonical SDK conversation events for backend rehydrate when available', async () => {
    markConversationInferenceSessionUnknown('conv-sdk-events');
    mockDesktopRuntime.loadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-sdk-events',
      revisionId: 'rev-1',
      messages: [
        {
          role: 'assistant',
          content: 'canonical answer',
        } as any,
      ],
      compactedReplay: null,
      toolTrace: { calls: [] },
      compaction: { status: 'none' },
    } as any);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-sdk-events',
      userId: 'user-1',
    });

    expect(mockDesktopRuntime.loadRehydrateSnapshot).toHaveBeenCalledTimes(1);
    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-sdk-events',
      messages: [
        expect.objectContaining({
          role: 'assistant',
          content: 'canonical answer',
        }),
      ],
      workspacePath: null,
    }));
  });

  test('skips transcript loading and backend rehydrate for fresh local conversations', async () => {
    markConversationInferenceSessionLocalOnly('conv-fresh');

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-fresh',
      userId: 'user-1',
    });

    expect(mockLoadLocalConversationSnapshot).not.toHaveBeenCalled();
    expect(mockDesktopRuntime.rehydrate).not.toHaveBeenCalled();
    expect(getConversationInferenceSessionState('conv-fresh')).toBe('hydrated');
  });

  test('explicit replay rehydrate always sends the backend replacement payload, even when empty', async () => {
    await rehydrateConversationInferenceSession({
      conversationRef: 'conv-replay',
      messages: [],
    });

    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledWith({
      conversationRef: 'conv-replay',
      messages: [],
      workspacePath: null,
    });
    expect(getConversationInferenceSessionState('conv-replay')).toBe('hydrated');
  });

  test('invalidating sync state forces a later ensure to rehydrate again', async () => {
    markConversationInferenceSessionUnknown('conv-reconnect');
    mockDesktopRuntime.loadRehydrateSnapshot.mockResolvedValue({
      conversationRef: 'conv-reconnect',
      revisionId: 'rev-1',
      messages: [
        {
          role: 'assistant',
          content: 'previous answer',
          message_type: 'llm-text',
          metadata: {},
        } as any,
      ],
      compactedReplay: null,
      toolTrace: { calls: [] },
      compaction: { status: 'none' },
    } as any);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    invalidateConversationInferenceSessionState();
    markConversationInferenceSessionUnknown('conv-reconnect');

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    expect(mockDesktopRuntime.rehydrate).toHaveBeenCalledTimes(2);
  });

  test('clearing a conversation removes its sync state record', () => {
    markConversationInferenceSessionLocalOnly('conv-clear');

    clearConversationInferenceSessionState('conv-clear');

    expect(getConversationInferenceSessionState('conv-clear')).toBeNull();
  });
});
