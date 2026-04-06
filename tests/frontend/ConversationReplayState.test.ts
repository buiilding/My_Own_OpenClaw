import {
  appendConversationReplayEntry,
  clearConversationReplayStateCache,
  deleteConversationStoredState,
  ensureConversationReplayStateInitialized,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from '../../frontend/src/renderer/infrastructure/transcript/conversationReplayState';
import { loadConversationTranscriptMemories } from '../../frontend/src/renderer/infrastructure/transcript/conversationTranscriptLoader';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationTranscriptLoader', () => ({
  loadConversationTranscriptMemories: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    STORE_TRANSCRIPT: 'store-transcript',
    DELETE_CONVERSATION: 'delete-conversation',
  },
}));

const mockLoadConversationTranscriptMemories = loadConversationTranscriptMemories as jest.MockedFunction<typeof loadConversationTranscriptMemories>;
const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

describe('conversationReplayState', () => {
  beforeEach(() => {
    clearConversationReplayStateCache();
    mockLoadConversationTranscriptMemories.mockReset();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ success: true, data: {} } as any);
  });

  test('bootstraps replay rows from transcript history when replay is missing', async () => {
    mockLoadConversationTranscriptMemories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          role: 'user',
          content: 'hello',
          message_type: 'user',
          message_index: 3,
          metadata: {},
        } as any,
      ]);

    const state = await ensureConversationReplayStateInitialized({
      conversationRef: 'conv-1',
      userId: 'user-1',
      workspacePath: '/workspace',
      workspaceName: 'WindieOS',
    });

    expect(state).toBe('bootstrapped');
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-1',
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'store-transcript', expect.objectContaining({
      userId: 'user-1',
      conversationRef: 'conv-1',
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
      messageIndex: 3,
      rehydrateEntry: expect.objectContaining({
        role: 'user',
        content: 'hello',
        message_type: 'user',
      }),
    }));
  });

  test('appends replay rows with explicit internal record kind', async () => {
    await appendConversationReplayEntry(
      {
        conversationRef: 'conv-1',
        userId: 'user-1',
      },
      {
        messageIndex: 7,
        rehydrateEntry: {
          role: 'assistant',
          content: 'done',
          message_type: 'llm-text',
        },
      },
    );

    expect(mockInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      conversationRef: 'conv-1',
      userId: 'user-1',
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
      messageIndex: 7,
      rehydrateEntry: expect.objectContaining({
        role: 'assistant',
        content: 'done',
      }),
    }));
  });

  test('deletes raw transcript and replay rows together for one conversation', async () => {
    await deleteConversationStoredState({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-1',
      recordKind: 'transcript',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'delete-conversation', {
      userId: 'user-1',
      conversationId: 'conv-1',
      recordKind: TRANSCRIPT_REPLAY_RECORD_KIND,
    });
  });
});
