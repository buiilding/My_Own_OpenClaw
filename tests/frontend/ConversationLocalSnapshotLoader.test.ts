import { loadStoredConversationEntries } from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';
import { loadLocalConversationSnapshot } from '../../frontend/src/renderer/infrastructure/transcript/conversationLocalSnapshotLoader';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
  loadStoredConversationEntries: jest.fn(),
}));

const mockLoadStoredConversationEntries = loadStoredConversationEntries as jest.MockedFunction<typeof loadStoredConversationEntries>;

describe('conversationLocalSnapshotLoader', () => {
  beforeEach(() => {
    mockLoadStoredConversationEntries.mockReset();
  });

  test('loads transcript rows for dashboard-style snapshots and derives workspace binding from transcript metadata', async () => {
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      {
        role: 'user',
        content: 'hello',
        message_type: 'user',
        metadata: {
          workspace_path: '/tmp/project-a',
          workspace_name: 'project-a',
        },
      } as any,
    ]);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-1',
      includeParsedMessages: true,
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(1);
    expect(snapshot.transcriptEntries).toHaveLength(1);
    expect(snapshot.replayEntries).toHaveLength(0);
    expect(snapshot.workspaceBinding).toEqual({
      workspacePath: '/tmp/project-a',
      workspaceName: 'project-a',
    });
    expect(snapshot.parsedMessages).toEqual([
      expect.objectContaining({
        text: 'hello',
        sender: 'user',
      }),
    ]);
    expect(snapshot.rehydrateMessages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'hello',
        message_type: 'user',
      }),
    ]);
  });

  test('prefers replay-state rows for rehydrate payloads while keeping workspace binding from transcript rows', async () => {
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
      .mockResolvedValueOnce([
        {
          role: 'user',
          content: 'visible transcript',
          message_type: 'user',
          metadata: {
            workspace_path: '/tmp/project-b',
          },
        } as any,
      ]);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-2',
      includeReplayState: true,
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(2);
    expect(snapshot.workspaceBinding).toEqual({
      workspacePath: '/tmp/project-b',
      workspaceName: 'project-b',
    });
    expect(snapshot.rehydrateMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'compacted replay',
        message_type: 'context_compaction',
      }),
    ]);
  });

  test('builds rehydrate payloads through SDK projection and collapses duplicate tool outputs', async () => {
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      {
        id: 'tool-call-row',
        role: 'assistant',
        content: '{"name":"read_file"}',
        message_type: 'tool-call',
        correlation_id: 'req-read',
        tool_name: 'read_file',
        tool_call_id: 'call-read',
      } as any,
      {
        id: 'tool-output-local',
        role: 'tool',
        content: 'local result',
        message_type: 'tool-output',
        correlation_id: 'req-read',
        tool_name: 'read_file',
        tool_call_id: 'call-read',
      } as any,
      {
        id: 'tool-output-backend',
        role: 'tool',
        content: 'backend ack',
        message_type: 'tool-output',
        correlation_id: 'req-read',
        tool_name: 'read_file',
        tool_call_id: 'call-read',
      } as any,
    ]);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-tools',
    });

    expect(snapshot.rehydrateMessages.filter(message => message.role === 'tool')).toHaveLength(1);
    expect(snapshot.rehydrateMessages[0]).toEqual(expect.objectContaining({
      role: 'assistant',
      tool_call_id: 'call-read',
    }));
  });

  test('falls back to conversation-level workspace binding when transcript rows do not carry one', async () => {
    mockLoadStoredConversationEntries.mockResolvedValueOnce([
      {
        role: 'assistant',
        content: 'hello',
        message_type: 'llm-text',
      } as any,
    ]);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-3',
      conversation: {
        workspace_path: '/tmp/project-c',
        workspace_name: 'workspace-c',
      },
    });

    expect(snapshot.workspaceBinding).toEqual({
      workspacePath: '/tmp/project-c',
      workspaceName: 'workspace-c',
    });
  });
});
