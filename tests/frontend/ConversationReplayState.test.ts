import {
  appendConversationReplayEntry,
  buildReplayRowStoragePayload,
  clearConversationReplayStateCache,
  deleteConversationStoredState,
  ensureConversationReplayStateInitialized,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from '../../frontend/src/renderer/infrastructure/transcript/conversationReplayState';
import { loadStoredConversationEntries } from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
  loadStoredConversationEntries: jest.fn(),
}));

const mockLoadStoredConversationEntries = loadStoredConversationEntries as jest.MockedFunction<typeof loadStoredConversationEntries>;
const storeReplayRow = jest.fn();
const deleteConversationRecordKind = jest.fn();

const replayStoreDeps = {
  storeReplayRow,
  deleteConversationRecordKind,
};

describe('conversationReplayState', () => {
  beforeEach(() => {
    clearConversationReplayStateCache();
    mockLoadStoredConversationEntries.mockReset();
    storeReplayRow.mockReset();
    storeReplayRow.mockResolvedValue(undefined);
    deleteConversationRecordKind.mockReset();
    deleteConversationRecordKind.mockResolvedValue(undefined);
  });

  test('bootstraps replay rows from transcript history when replay is missing', async () => {
    mockLoadStoredConversationEntries
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
    }, replayStoreDeps);

    expect(state).toBe('bootstrapped');
    expect(storeReplayRow).toHaveBeenCalledTimes(1);
    const [context, entry] = storeReplayRow.mock.calls[0];
    expect(context).toEqual({
      userId: 'user-1',
      conversationRef: 'conv-1',
      workspacePath: '/workspace',
      workspaceName: 'WindieOS',
    });
    expect(entry).toEqual(expect.objectContaining({
      messageIndex: 3,
      rehydrateEntry: expect.objectContaining({
        role: 'user',
        content: 'hello',
        message_type: 'user',
        replay_generation_entry_index: 1,
        replay_generation_entry_count: 1,
        replay_generation_complete: true,
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
      replayStoreDeps,
    );

    expect(storeReplayRow).toHaveBeenCalledWith(
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
    expect(buildReplayRowStoragePayload(storeReplayRow.mock.calls[0][0], storeReplayRow.mock.calls[0][1])).toEqual(expect.objectContaining({
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
    }, replayStoreDeps);

    expect(deleteConversationRecordKind).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      conversationRef: 'conv-1',
    }, 'transcript');
    expect(deleteConversationRecordKind).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      conversationRef: 'conv-1',
    }, TRANSCRIPT_REPLAY_RECORD_KIND);
  });

  test('stale replay bootstrap does not rewrite replay rows after conversation state is cleared', async () => {
    let resolveReplayLookup: ((value: any[]) => void) | null = null;
    mockLoadStoredConversationEntries
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveReplayLookup = resolve;
      }))
      .mockResolvedValueOnce([
        {
          role: 'user',
          content: 'hello',
          message_type: 'user',
          message_index: 1,
          metadata: {},
        } as any,
      ]);

    const initializationPromise = ensureConversationReplayStateInitialized({
      conversationRef: 'conv-1',
      userId: 'user-1',
    }, replayStoreDeps);

    await Promise.resolve();

    await deleteConversationStoredState({
      conversationRef: 'conv-1',
      userId: 'user-1',
    }, replayStoreDeps);

    resolveReplayLookup?.([]);

    await expect(initializationPromise).resolves.toBe('empty');

    expect(deleteConversationRecordKind).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      conversationRef: 'conv-1',
    }, 'transcript');
    expect(deleteConversationRecordKind).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      conversationRef: 'conv-1',
    }, TRANSCRIPT_REPLAY_RECORD_KIND);
    expect(deleteConversationRecordKind).toHaveBeenCalledTimes(2);
    expect(storeReplayRow).not.toHaveBeenCalled();
  });
});
