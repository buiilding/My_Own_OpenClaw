import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { loadConversationTranscriptMemories } from '../../frontend/src/renderer/infrastructure/transcript/conversationTranscriptLoader';
import {
  clearConversationBackendSyncState,
  ensureConversationBackendState,
  getConversationBackendSyncState,
  invalidateConversationBackendSyncState,
  markConversationBackendStateFreshLocal,
  markConversationBackendStateUnknown,
  rehydrateConversationBackendState,
} from '../../frontend/src/renderer/features/chat/session/conversationBackendSyncRuntime';

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendRehydrateConversation: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationTranscriptLoader', () => ({
  loadConversationTranscriptMemories: jest.fn(),
}));

const mockSendRehydrateConversation = ApiClient.sendRehydrateConversation as jest.MockedFunction<typeof ApiClient.sendRehydrateConversation>;
const mockLoadConversationTranscriptMemories = loadConversationTranscriptMemories as jest.MockedFunction<typeof loadConversationTranscriptMemories>;

describe('conversationBackendSyncRuntime', () => {
  beforeEach(() => {
    invalidateConversationBackendSyncState();
    mockSendRehydrateConversation.mockReset();
    mockLoadConversationTranscriptMemories.mockReset();
  });

  test('lazy rehydrates an unknown existing conversation once and then treats it as synced', async () => {
    markConversationBackendStateUnknown('conv-existing');
    mockLoadConversationTranscriptMemories.mockResolvedValue([
      {
        role: 'user',
        content: 'hello',
        message_type: 'user',
        metadata: {},
      } as any,
    ]);

    await ensureConversationBackendState({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });
    await ensureConversationBackendState({
      conversationRef: 'conv-existing',
      userId: 'user-1',
    });

    expect(mockLoadConversationTranscriptMemories).toHaveBeenCalledTimes(1);
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
    );
    expect(getConversationBackendSyncState('conv-existing')).toBe('synced');
  });

  test('skips transcript loading and backend rehydrate for fresh local conversations', async () => {
    markConversationBackendStateFreshLocal('conv-fresh');

    await ensureConversationBackendState({
      conversationRef: 'conv-fresh',
      userId: 'user-1',
    });

    expect(mockLoadConversationTranscriptMemories).not.toHaveBeenCalled();
    expect(mockSendRehydrateConversation).not.toHaveBeenCalled();
    expect(getConversationBackendSyncState('conv-fresh')).toBe('synced');
  });

  test('explicit replay rehydrate always sends the backend replacement payload, even when empty', async () => {
    await rehydrateConversationBackendState({
      conversationRef: 'conv-replay',
      messages: [],
    });

    expect(mockSendRehydrateConversation).toHaveBeenCalledWith('conv-replay', []);
    expect(getConversationBackendSyncState('conv-replay')).toBe('synced');
  });

  test('invalidating sync state forces a later ensure to rehydrate again', async () => {
    markConversationBackendStateUnknown('conv-reconnect');
    mockLoadConversationTranscriptMemories.mockResolvedValue([
      {
        role: 'assistant',
        content: 'previous answer',
        message_type: 'llm-text',
        metadata: {},
      } as any,
    ]);

    await ensureConversationBackendState({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    invalidateConversationBackendSyncState();
    markConversationBackendStateUnknown('conv-reconnect');

    await ensureConversationBackendState({
      conversationRef: 'conv-reconnect',
      userId: 'user-1',
    });

    expect(mockSendRehydrateConversation).toHaveBeenCalledTimes(2);
  });

  test('clearing a conversation removes its sync state record', () => {
    markConversationBackendStateFreshLocal('conv-clear');

    clearConversationBackendSyncState('conv-clear');

    expect(getConversationBackendSyncState('conv-clear')).toBeNull();
  });
});
