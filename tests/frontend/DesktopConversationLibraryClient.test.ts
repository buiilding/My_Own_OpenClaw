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
    mockInvokeWindieCommand.mockImplementation(async (command) => {
      if (command === 'diagnostics.append') {
        return { stored: true };
      }
      if (command === 'conversations.list') {
        return [
        {
          conversationRef: 'conv-1',
          title: 'Chat 1',
          updatedAt: '2026-06-05T00:00:00.000Z',
          eventCount: 2,
        },
        ];
      }
      if (command === 'conversations.search') {
        return [
        {
          conversationRef: 'conv-2',
          title: 'Search Hit',
          updatedAt: '2026-06-05T00:01:00.000Z',
          eventCount: 3,
          snippet: 'matched text',
        },
        ];
      }
      if (command === 'conversations.delete') {
        return { deleted: true };
      }
      if (command === 'conversation.loadDisplay') {
        return {
        displayRows: [{ id: 'row-1', conversationRef: 'conv-1', role: 'assistant', type: 'assistant', content: 'hello' }],
        };
      }
      return null;
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

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.list', {
      userId: 'user-1',
      limit: 10,
      _diagnostics: expect.objectContaining({
        path: 'conversation.metadata.list',
        traceId: expect.stringMatching(/^diag_/),
        requestId: expect.stringMatching(/^req_/),
      }),
    });
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      stage: 'requested',
      status: 'succeeded',
      runtime: 'renderer',
      data: expect.objectContaining({
        hasUserId: true,
        limit: 10,
      }),
    }));
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      stage: 'normalized',
      status: 'succeeded',
      runtime: 'renderer',
      data: expect.objectContaining({
        resultCount: 1,
      }),
    }));
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.search', {
      userId: 'user-1',
      query: 'hit',
      limit: 5,
    });
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.loadDisplay', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('emits rendered diagnostics from a dashboard load context', () => {
    DesktopConversationLibraryClient.emitConversationMetadataListRendered(
      {
        path: 'conversation.metadata.list',
        traceId: 'diag-1',
        requestId: 'req-1',
      },
      {
        status: 'failed',
        error: new Error('Windie SDK command requires an active user id.'),
      },
    );

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      _diagnostics: expect.objectContaining({
        traceId: 'diag-1',
        requestId: 'req-1',
      }),
      stage: 'rendered',
      status: 'failed',
      runtime: 'renderer',
      error: {
        code: 'active_user_id_required',
        message: 'Windie SDK command requires an active user id.',
      },
    }));
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
