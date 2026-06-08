import { DesktopConversationLibraryClient } from '../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient';
import { invokeWindieCommand } from '../../frontend/src/renderer/app/runtime/windieCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/windieCommandInvokeClient', () => ({
  invokeWindieCommand: jest.fn(),
}));

const mockInvokeWindieCommand = invokeWindieCommand as jest.MockedFunction<typeof invokeWindieCommand>;

describe('DesktopConversationLibraryClient', () => {
  beforeEach(() => {
    mockInvokeWindieCommand.mockReset();
  });

  test('lists, searches, deletes, and loads through SDK-shaped commands', async () => {
    mockInvokeWindieCommand
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-1',
          title: 'Chat 1',
          updatedAt: '2026-06-05T00:00:00.000Z',
          eventCount: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          conversationRef: 'conv-2',
          title: 'Search Hit',
          updatedAt: '2026-06-05T00:01:00.000Z',
          eventCount: 3,
          snippet: 'matched text',
        },
      ])
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({
        displayRows: [{ id: 'row-1', conversationRef: 'conv-1', role: 'assistant', type: 'assistant', content: 'hello' }],
      });

    await expect(DesktopConversationLibraryClient.listMetadata('user-1', { limit: 10 })).resolves.toEqual([
      expect.objectContaining({ conversationRef: 'conv-1' }),
    ]);
    await expect(DesktopConversationLibraryClient.searchConversations({
      userId: 'user-1',
      query: 'hit',
      limit: 5,
    })).resolves.toEqual([
      expect.objectContaining({
        conversation_id: 'conv-2',
        snippet: 'matched text',
      }),
    ]);
    await expect(DesktopConversationLibraryClient.deleteConversation('user-1', 'conv-1')).resolves.toBeUndefined();
    await expect(DesktopConversationLibraryClient.loadDisplayRows('user-1', 'conv-1')).resolves.toEqual([
      { id: 'row-1', conversationRef: 'conv-1', role: 'assistant', type: 'assistant', content: 'hello' },
    ]);

    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'conversations.list', {
      userId: 'user-1',
      limit: 10,
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'conversations.search', {
      userId: 'user-1',
      query: 'hit',
      limit: 5,
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(3, 'conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(4, 'conversation.loadDisplay', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('filters loaded display rows to the requested conversation', async () => {
    mockInvokeWindieCommand.mockResolvedValueOnce({
      displayRows: [
        { id: 'row-1', conversationRef: 'conv-1', role: 'user', type: 'user_message', content: 'yo' },
        { id: 'row-old', conversationRef: 'conv-old', role: 'assistant', type: 'assistant_message', content: 'old' },
        { id: 'row-missing', role: 'assistant', type: 'assistant_message', content: 'missing scope' },
      ],
    });

    await expect(DesktopConversationLibraryClient.loadDisplayRows('user-1', 'conv-1')).resolves.toEqual([
      { id: 'row-1', conversationRef: 'conv-1', role: 'user', type: 'user_message', content: 'yo' },
    ]);
  });
});
