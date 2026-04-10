import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { loadStoredConversationEntries } from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';
import {
  clearConversationInferenceSessionState,
  ensureConversationInferenceSessionHydrated,
  getConversationInferenceSessionState,
  invalidateConversationInferenceSessionState,
  markConversationInferenceSessionLocalOnly,
  markConversationInferenceSessionUnknown,
  rehydrateConversationInferenceSession,
} from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendRehydrateConversation: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
  loadStoredConversationEntries: jest.fn(),
}));

const mockSendRehydrateConversation = ApiClient.sendRehydrateConversation as jest.MockedFunction<typeof ApiClient.sendRehydrateConversation>;
const mockLoadStoredConversationEntries = loadStoredConversationEntries as jest.MockedFunction<typeof loadStoredConversationEntries>;

describe('conversationInferenceSessionRuntime', () => {
  beforeEach(() => {
    invalidateConversationInferenceSessionState();
    mockSendRehydrateConversation.mockReset();
    mockLoadStoredConversationEntries.mockReset();
  });

  test('lazy rehydrates an unknown existing conversation once and then treats it as synced', async () => {
    markConversationInferenceSessionUnknown('conv-existing');
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          role: 'user',
          content: 'hello',
          message_type: 'user',
          metadata: {},
        } as any,
      ]);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });
    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(2);
    expect(mockSendRehydrateConversation).toHaveBeenCalledTimes(1);
    expect(mockSendRehydrateConversation).toHaveBeenCalledWith(
      'conv-existing',
      [
        expect.objectContaining({
          role: 'user',
          content: 'hello',
          message_type: 'user',
        }),
      ],
      null,
    );
    expect(getConversationInferenceSessionState('conv-existing')).toBe('hydrated');
  });

  test('prefers persisted replay state when available', async () => {
    markConversationInferenceSessionUnknown('conv-replay-preferred');
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce([
        {
          metadata: {
            rehydrate_entry: {
              role: 'assistant',
              content: 'compacted replay',
              message_type: 'context_compaction',
            },
          },
        } as any,
      ])
      .mockResolvedValueOnce([]);

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-replay-preferred',
      userId: 'user-1',
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(2);
    expect(mockSendRehydrateConversation).toHaveBeenCalledWith(
      'conv-replay-preferred',
      [
        expect.objectContaining({
          role: 'assistant',
          content: 'compacted replay',
          message_type: 'context_compaction',
        }),
      ],
      null,
    );
  });

  test('skips transcript loading and backend rehydrate for fresh local conversations', async () => {
    markConversationInferenceSessionLocalOnly('conv-fresh');

    await ensureConversationInferenceSessionHydrated({
      conversationRef: 'conv-fresh',
      userId: 'user-1',
    });

    expect(mockLoadStoredConversationEntries).not.toHaveBeenCalled();
    expect(mockSendRehydrateConversation).not.toHaveBeenCalled();
    expect(getConversationInferenceSessionState('conv-fresh')).toBe('hydrated');
  });

  test('explicit replay rehydrate always sends the backend replacement payload, even when empty', async () => {
    await rehydrateConversationInferenceSession({
      conversationRef: 'conv-replay',
      messages: [],
    });

    expect(mockSendRehydrateConversation).toHaveBeenCalledWith('conv-replay', [], null);
    expect(getConversationInferenceSessionState('conv-replay')).toBe('hydrated');
  });

  test('invalidating sync state forces a later ensure to rehydrate again', async () => {
    markConversationInferenceSessionUnknown('conv-reconnect');
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          role: 'assistant',
          content: 'previous answer',
          message_type: 'llm-text',
          metadata: {},
        } as any,
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          role: 'assistant',
          content: 'previous answer',
          message_type: 'llm-text',
          metadata: {},
        } as any,
      ]);

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

    expect(mockSendRehydrateConversation).toHaveBeenCalledTimes(2);
  });

  test('clearing a conversation removes its sync state record', () => {
    markConversationInferenceSessionLocalOnly('conv-clear');

    clearConversationInferenceSessionState('conv-clear');

    expect(getConversationInferenceSessionState('conv-clear')).toBeNull();
  });
});
