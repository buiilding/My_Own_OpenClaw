import {
  listStoredConversations,
  loadStoredConversationEntries,
  searchStoredConversations,
} from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_CHAT_CONVERSATIONS: 'list-chat-conversations',
    SEARCH_CHAT_CONVERSATIONS: 'search-chat-conversations',
    GET_CHAT_EVENTS: 'get-chat-events',
  },
}));

describe('localConversationStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('paginates get-chat-events calls by afterMessageIndex and returns merged memories', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          events: [
            { id: 'm1', message_index: 1 },
            { id: 'm2', message_index: 2 },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          events: [
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
      'get-chat-events',
      expect.objectContaining({
        userId: 'default_user',
        conversationId: 'conv_1',
        limit: 2,
        recordKind: 'chat_event',
        afterMessageIndex: null,
      }),
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'get-chat-events',
      expect.objectContaining({
        userId: 'default_user',
        conversationId: 'conv_1',
        limit: 2,
        recordKind: 'chat_event',
        afterMessageIndex: 2,
      }),
    );
  });

  test('does not send a hidden conversation list limit when omitted', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        conversations: [
          { conversation_id: 'conv-1' },
        ],
      },
    });

    const result = await listStoredConversations({
      userId: 'default_user',
    });

    expect(result).toEqual([{ conversation_id: 'conv-1' }]);
    expect(mockInvoke).toHaveBeenCalledWith(
      'list-chat-conversations',
      {
        userId: 'default_user',
        recordKind: 'chat_event',
      },
    );
  });

  test('sends an explicit chat-event conversation list limit when requested', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: { conversations: [] },
    });

    await listStoredConversations({
      userId: 'default_user',
      recordKind: 'transcript',
      limit: 25,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'list-chat-conversations',
      {
        userId: 'default_user',
        recordKind: 'chat_event',
        limit: 25,
      },
    );
  });

  test('searches canonical conversation event rows by default', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        conversations: [
          { conversation_id: 'conv-1', record_kind: 'chat_event' },
        ],
      },
    });

    const result = await searchStoredConversations({
      userId: 'default_user',
      query: 'project',
      limit: 5,
    });

    expect(result).toEqual([{ conversation_id: 'conv-1', record_kind: 'chat_event' }]);
    expect(mockInvoke).toHaveBeenCalledWith(
      'search-chat-conversations',
      {
        userId: 'default_user',
        query: 'project',
        limit: 5,
        recordKind: 'chat_event',
      },
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
