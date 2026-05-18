import { loadStoredConversationEntries } from '../../frontend/src/renderer/infrastructure/transcript/localConversationStore';
import {
  CHAT_EVENT_RECORD_KIND,
} from '../../frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore';
import { loadLocalConversationSnapshot } from '../../frontend/src/renderer/infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  createConversationEvent,
} from '../../frontend/src/renderer/infrastructure/api/windieSdkClient';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
  loadStoredConversationEntries: jest.fn(),
}));

const mockLoadStoredConversationEntries = loadStoredConversationEntries as jest.MockedFunction<typeof loadStoredConversationEntries>;

function sdkEventRow(event: ReturnType<typeof createConversationEvent>, metadata: Record<string, unknown> = {}) {
  return {
    ...metadata,
    metadata: {
      ...(metadata.metadata as Record<string, unknown> | undefined),
      structured_payload: {
        windieSdkConversationEvent: event,
      },
    },
  } as any;
}

describe('conversationLocalSnapshotLoader', () => {
  beforeEach(() => {
    mockLoadStoredConversationEntries.mockReset();
  });

  test('loads canonical event rows and derives workspace binding from event metadata', async () => {
    const event = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'hello' },
    });
    const rows = [
      sdkEventRow(event, {
        metadata: {
          workspace_path: '/tmp/project-a',
          workspace_name: 'project-a',
        },
      }),
    ];
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-1',
      includeParsedMessages: true,
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledWith(expect.objectContaining({
      recordKind: CHAT_EVENT_RECORD_KIND,
    }));
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
      }),
    ]);
  });

  test('uses compaction events for rehydrate payloads', async () => {
    const eventRows = [
      sdkEventRow(createConversationEvent({
        eventId: 'evt-user',
        type: 'user_message',
        conversationRef: 'conv-2',
        revisionId: 'rev-1',
        payload: { text: 'visible transcript' },
      })),
      sdkEventRow(createConversationEvent({
        eventId: 'compaction-gen-1',
        type: 'compaction_applied',
        conversationRef: 'conv-2',
        revisionId: 'rev-compact',
        payload: {
          generationId: 'gen-1',
          sourceRevisionId: 'rev-compact',
          entries: [
            {
              role: 'assistant',
              content: 'compacted replay',
              message_type: 'context_compaction',
            },
          ],
          entryCount: 1,
          complete: true,
        },
      })),
    ];
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce(eventRows)
      .mockResolvedValueOnce(eventRows);

    const snapshot = await loadLocalConversationSnapshot({
      userId: 'user-1',
      conversationRef: 'conv-2',
      includeReplayState: true,
    });

    expect(mockLoadStoredConversationEntries).toHaveBeenCalledTimes(2);
    expect(snapshot.replayEntries).toHaveLength(0);
    expect(snapshot.rehydrateMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'compacted replay',
        message_type: 'context_compaction',
      }),
    ]);
  });

  test('builds rehydrate payloads through SDK projection and collapses duplicate tool outputs', async () => {
    const events = [
      createConversationEvent({
        eventId: 'tool-call-row',
        type: 'tool_call',
        conversationRef: 'conv-tools',
        revisionId: 'rev-tools',
        payload: {
          text: '{"name":"read_file"}',
          correlationId: 'req-read',
          requestId: 'req-read',
          toolName: 'read_file',
          toolCallId: 'call-read',
          structuredPayload: {
            role: 'assistant',
            content: '{"name":"read_file"}',
            tool_call_id: 'call-read',
          },
        },
      }),
      createConversationEvent({
        eventId: 'tool-output-local',
        type: 'tool_output',
        conversationRef: 'conv-tools',
        revisionId: 'rev-tools',
        payload: {
          text: 'local result',
          correlationId: 'req-read',
          requestId: 'req-read',
          toolName: 'read_file',
          toolCallId: 'call-read',
        },
      }),
      createConversationEvent({
        eventId: 'tool-output-backend',
        type: 'tool_output',
        conversationRef: 'conv-tools',
        revisionId: 'rev-tools',
        payload: {
          text: 'backend ack',
          correlationId: 'req-read',
          requestId: 'req-read',
          toolName: 'read_file',
          toolCallId: 'call-read',
        },
      }),
    ];
    const rows = events.map((event) => sdkEventRow(event));
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);

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

  test('falls back to conversation-level workspace binding when event rows do not carry one', async () => {
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-3',
      revisionId: 'rev-3',
      payload: { text: 'hello' },
    });
    const rows = [sdkEventRow(event)];
    mockLoadStoredConversationEntries
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);

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
