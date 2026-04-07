import { loadStoredConversationEntries } from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_CONVERSATIONS: 'list-conversations',
    SEARCH_CONVERSATIONS: 'search-conversations',
    GET_CONVERSATION: 'get-conversation',
  },
}));

describe('localConversationStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('paginates get-conversation calls by afterMessageIndex and returns merged memories', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          memories: [
            { id: 'm1', message_index: 1 },
            { id: 'm2', message_index: 2 },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          memories: [
            { id: 'm3', message_index: 3 },
          ],
        },
      });

    const result = await loadStoredConversationEntries({
      userId: 'default_user',
      conversationRef: 'conv_1',
      pageSize: 2,
    });

    expect(result.map((entry) => entry.id)).toEqual(['m1', 'm2', 'm3']);
    expect(mockInvoke).toHaveBeenNthCalledWith(
      1,
      'get-conversation',
      expect.objectContaining({
        userId: 'default_user',
        conversationId: 'conv_1',
        limit: 2,
        afterMessageIndex: null,
      }),
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'get-conversation',
      expect.objectContaining({
        userId: 'default_user',
        conversationId: 'conv_1',
        limit: 2,
        afterMessageIndex: 2,
      }),
    );
  });

  test('returns empty memories without invoking bridge when user or conversation is missing', async () => {
    const result = await loadStoredConversationEntries({
      userId: '',
      conversationRef: '',
    });

    expect(result).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
