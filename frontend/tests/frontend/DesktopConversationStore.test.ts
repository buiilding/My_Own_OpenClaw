/**
 * Covers desktop conversation store. behavior in the frontend test suite.
 */

import {
  createDesktopConversationStore,
  loadDesktopTraceTimeline,
} from '../../src/renderer/infrastructure/transcript/desktopConversationStore';
import {
  createConversationEvent,
} from '../../packages/windie-sdk-js/src';
import { AgentSdkCommandInvokeClient } from '../../src/renderer/app/runtime/agentSdkCommandInvokeClient';

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: jest.fn(),
  },
}));

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;
const mockInvokeAgentSdkCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;

const defaultRevision = {
  conversationRef: 'conv-1',
  revisionId: 'rev-stored-test',
  updatedAt: '1970-01-01T00:00:00.000Z',
};

describe('desktop conversation store factory', () => {
  beforeEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
    mockInvokeAgentSdkCommand.mockImplementation(async (command, payload) => {
      if (command === 'conversation.getRevision') {
        return {
          ...defaultRevision,
          conversationRef: String(payload?.conversationRef || defaultRevision.conversationRef),
        } as never;
      }
      if (command === 'conversation.load') {
        return {
          state: { events: [] },
          display: {
            conversationRef: String(payload?.conversationRef || 'conv-1'),
            revisionId: 'rev-load',
            messages: [],
            compaction: { status: 'idle' },
          },
          displayRows: [],
          rehydrate: {
            conversationRef: String(payload?.conversationRef || 'conv-1'),
            revisionId: 'rev-load',
            messages: [],
          },
        } as never;
      }
      if (command === 'conversations.list' || command === 'conversations.search') {
        return [] as never;
      }
      return null as never;
    });
  });

  test('appends canonical SDK events through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'hello' },
    });

    await store.appendEvent(event);

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.appendEvent', {
      userId: 'user-1',
      conversationRef: 'conv-1',
      event,
    });
  });

  test('loads events through the SDK conversation load command', async () => {
    const store = createDesktopConversationStore('user-1');
    const event = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: { text: 'from sdk event' },
    });
    mockInvokeAgentSdkCommand.mockResolvedValueOnce({
      state: { events: [event] },
    } as never);

    const events = await store.loadEvents('conv-1');

    expect(events).toEqual([event]);
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.load', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('loads display rows from ConversationView only', async () => {
    const store = createDesktopConversationStore('user-1');
    mockInvokeAgentSdkCommand.mockResolvedValueOnce({
      view: {
        displayRows: [
          {
            id: 'row-view',
            conversationRef: 'conv-1',
            role: 'assistant',
            type: 'assistant_message',
            content: 'from view',
          },
        ],
      },
    } as never);

    await expect(store.loadDisplayRows('conv-1')).resolves.toEqual([
      {
        id: 'row-view',
        conversationRef: 'conv-1',
        role: 'assistant',
        type: 'assistant_message',
        content: 'from view',
      },
    ]);
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.loadDisplay', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('loads durable trace timelines through the SDK conversation load command', async () => {
    const traceEvent = createConversationEvent({
      eventId: 'evt-trace',
      type: 'trace_event',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      timestamp: '2026-05-15T12:00:00.000Z',
      payload: {
        schemaVersion: 1,
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: null,
        path: 'memory.retrieval',
        stage: 'retrieval',
        status: 'succeeded',
        runtime: 'sdk',
      },
    });
    const visibleEvent = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      payload: { text: 'hello' },
    });
    mockInvokeAgentSdkCommand.mockResolvedValueOnce({
      state: { events: [visibleEvent, traceEvent] },
    } as never);

    const timeline = await loadDesktopTraceTimeline('user-1', 'conv-1', {
      turnRef: 'turn-1',
      path: 'memory.retrieval',
    });

    expect(timeline).toEqual([
      expect.objectContaining({
        eventId: 'evt-trace',
        traceId: 'trace-1',
        path: 'memory.retrieval',
        status: 'succeeded',
      }),
    ]);
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.load', {
      userId: 'user-1',
      conversationRef: 'conv-1',
    });
  });

  test('stores compacted replay snapshots through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const snapshot = {
      generationId: 'gen-1',
      conversationRef: 'conv-compact',
      sourceRevisionId: 'rev-source',
      sourceTurnRef: 'turn-compact',
      createdAt: '2026-05-15T12:00:00.000Z',
      entries: [
        {
          role: 'assistant',
          content: 'compacted summary',
          message_type: 'context_compaction',
        },
      ],
      entryCount: 1,
      complete: true,
      active: true,
    };

    await store.replaceCompactedReplay(snapshot);

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.replaceCompactedReplay', {
      userId: 'user-1',
      conversationRef: 'conv-compact',
      snapshot,
    });
  });

  test('deletes conversations through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');

    await store.deleteConversation('conv-delete');

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversations.delete', {
      userId: 'user-1',
      conversationRef: 'conv-delete',
    });
  });

  test('lists metadata through the SDK command bridge', async () => {
    const store = createDesktopConversationStore('user-1');
    const metadata = [
      {
        conversationRef: 'conv-sdk',
        revisionId: 'rev-stored-conv-sdk',
        title: 'SDK title',
        lastMessage: 'latest',
        updatedAt: '2026-05-15T12:00:00.000Z',
        eventCount: 3,
        workspacePath: '/work/project-alpha',
        workspaceName: 'Project Alpha',
        snippet: null,
        matchedRole: null,
      },
    ];
    mockInvokeAgentSdkCommand.mockResolvedValueOnce(metadata as never);

    await expect(store.listMetadata({ limit: 25 })).resolves.toEqual(metadata);
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversations.list', {
      userId: 'user-1',
      limit: 25,
    });
  });

});
