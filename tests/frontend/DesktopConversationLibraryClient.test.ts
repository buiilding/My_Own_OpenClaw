/**
 * Covers desktop conversation library client. behavior in the frontend test suite.
 */

import { DesktopConversationLibraryClient } from '../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient';
import { invokeAgentSdkCommand } from '../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  invokeAgentSdkCommand: jest.fn(),
}));

const mockInvokeAgentSdkCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;
const retiredSidecarDaemonDiscoveryError = `timed out waiting for ${'sidecar'} daemon discovery`;

describe('DesktopConversationLibraryClient', () => {
  beforeEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
  });

  test('lists, searches, deletes, and loads through SDK-shaped commands', async () => {
    mockInvokeAgentSdkCommand.mockImplementation(async (command) => {
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
          matchedRole: 'user',
          workspacePath: '/work/project-alpha',
          workspaceName: 'Project Alpha',
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
        matched_role: 'user',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
      }),
    ]);
    await expect(DesktopConversationLibraryClient.deleteConversation('user-1', 'conv-1')).resolves.toBeUndefined();
    await expect(DesktopConversationLibraryClient.loadDisplayRows('user-1', 'conv-1')).resolves.toEqual([
      { id: 'row-1', conversationRef: 'conv-1', role: 'assistant', type: 'assistant', content: 'hello' },
    ]);

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversations.list', {
      userId: 'user-1',
      limit: 10,
      _diagnostics: expect.objectContaining({
        path: 'conversation.metadata.list',
        traceId: expect.stringMatching(/^diag_/),
        requestId: expect.stringMatching(/^req_/),
      }),
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      stage: 'requested',
      status: 'succeeded',
      runtime: 'renderer',
      data: expect.objectContaining({
        hasUserId: true,
        limit: 10,
      }),
    }));
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      stage: 'normalized',
      status: 'succeeded',
      runtime: 'renderer',
      data: expect.objectContaining({
        resultCount: 1,
      }),
    }));
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversations.search', {
      userId: 'user-1',
      query: 'hit',
      limit: 5,
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.loadDisplay', {
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
        error: new Error('Agent SDK command requires an active user id.'),
      },
    );

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      _diagnostics: expect.objectContaining({
        traceId: 'diag-1',
        requestId: 'req-1',
      }),
      stage: 'rendered',
      status: 'failed',
      runtime: 'renderer',
      error: {
        code: 'active_user_id_required',
        message: 'Agent SDK command requires an active user id.',
      },
    }));
  });

  test('emits generic local-runtime diagnostics for local availability failures', () => {
    DesktopConversationLibraryClient.emitConversationMetadataListRendered(
      {
        path: 'conversation.metadata.list',
        traceId: 'diag-local-runtime',
        requestId: 'req-local-runtime',
      },
      {
        status: 'failed',
        error: new Error('Local runtime not ready'),
      },
    );

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      stage: 'rendered',
      status: 'failed',
      runtime: 'renderer',
      error: {
        code: 'local_runtime_unavailable',
        message: 'Local runtime not ready',
      },
    }));
  });

  test('classifies transient metadata list runtime errors behind the app facade', () => {
    expect(DesktopConversationLibraryClient.isTransientMetadataListError(
      'Failed to list stored conversations: timed out waiting for local runtime discovery',
    )).toBe(true);
    expect(DesktopConversationLibraryClient.isTransientMetadataListError(
      'Local runtime not ready',
    )).toBe(true);
    expect(DesktopConversationLibraryClient.isTransientMetadataListError(
      'Local backend not ready',
    )).toBe(false);
    expect(DesktopConversationLibraryClient.isTransientMetadataListError(
      retiredSidecarDaemonDiscoveryError,
    )).toBe(false);
    expect(DesktopConversationLibraryClient.isTransientMetadataListError(
      'hard validation failure',
    )).toBe(false);
  });

  test('filters loaded display rows to the requested conversation', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValueOnce({
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
