const mockLoadRehydrateSnapshot = jest.fn();
const mockLoadLocalConversationSnapshot = jest.fn();
const mockRehydrateConversation = jest.fn();
const mockReplaceCompactedReplay = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    loadRehydrateSnapshot: (...args: unknown[]) => mockLoadRehydrateSnapshot(...args),
    createSeededConversationStore: jest.fn(),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
    replaceCompactedReplay: (...args: unknown[]) => mockReplaceCompactedReplay(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationLocalSnapshotLoader', () => ({
  loadLocalConversationSnapshot: (...args: unknown[]) => mockLoadLocalConversationSnapshot(...args),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopBackendCommandRuntimeClient', () => ({
  DesktopBackendCommandRuntimeClient: {
    rehydrateConversation: (...args: unknown[]) => mockRehydrateConversation(...args),
    sendQuery: jest.fn(),
    stop: jest.fn(),
    compactHistory: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => null),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: null,
      userId: null,
    })),
    setActiveConversationRef: jest.fn(),
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(),
  },
}));

describe('DesktopConversationRuntimeClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLoadRehydrateSnapshot.mockReset();
    mockLoadLocalConversationSnapshot.mockReset();
    mockRehydrateConversation.mockReset();
    mockReplaceCompactedReplay.mockReset();
  });

  test('loadLocalConversationSnapshot keeps transcript snapshot loading behind the facade', async () => {
    mockLoadLocalConversationSnapshot.mockResolvedValueOnce({
      transcriptEntries: [],
      replayEntries: [],
      workspaceBinding: { workspacePath: '/repo', workspaceName: 'repo' },
      parsedMessages: [],
      rehydrateMessages: [],
    });
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await expect(DesktopConversationRuntimeClient.loadLocalConversationSnapshot({
      conversationRef: 'conv-local',
      userId: 'user-1',
    })).resolves.toMatchObject({
      workspaceBinding: { workspacePath: '/repo' },
    });

    expect(mockLoadLocalConversationSnapshot).toHaveBeenCalledWith({
      conversationRef: 'conv-local',
      userId: 'user-1',
    });
  });

  test('rehydrateFromStore loads the SDK projection and sends backend rehydrate behind the facade', async () => {
    mockLoadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-sdk',
      revisionId: 'rev-1',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: { text: 'structured answer' } },
        { role: 'system', content: 'debug-only' },
      ],
    });
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await DesktopConversationRuntimeClient.rehydrateFromStore({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
      workspacePath: '/tmp/project',
    });

    expect(mockLoadRehydrateSnapshot).toHaveBeenCalledWith({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
      workspacePath: '/tmp/project',
    });
    expect(mockRehydrateConversation).toHaveBeenCalledWith({
      conversationRef: 'conv-sdk',
      workspacePath: '/tmp/project',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '{"text":"structured answer"}' },
      ],
    });
  });

  test('rehydrateFromStore skips backend rehydrate when the SDK projection has no provider messages', async () => {
    mockLoadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-empty',
      revisionId: 'rev-1',
      messages: [
        { role: 'system', content: 'debug-only' },
      ],
    });
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await DesktopConversationRuntimeClient.rehydrateFromStore({
      conversationRef: 'conv-empty',
      userId: 'user-1',
    });

    expect(mockRehydrateConversation).not.toHaveBeenCalled();
  });

  test('replaceCompactedReplayFromBackendEvent builds replay snapshots behind the desktop facade', async () => {
    mockReplaceCompactedReplay.mockResolvedValueOnce(undefined);
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await DesktopConversationRuntimeClient.replaceCompactedReplayFromBackendEvent({
      conversationRef: 'conv-compact',
      userId: 'user-compact',
      event: {
        id: 'compaction-event',
        turn_ref: 'turn-compact',
        payload: {
          replacement_history_entries: [
            { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
            null,
          ],
        },
      },
    });

    expect(mockReplaceCompactedReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'compaction-conv-compact-compaction-event',
        conversationRef: 'conv-compact',
        sourceRevisionId: 'rev-compaction-conv-compact-compaction-event',
        sourceTurnRef: 'turn-compact',
        entries: [
          { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
        ],
        entryCount: 1,
        complete: true,
        active: true,
      }),
      'user-compact',
    );
  });

  test('replaceCompactedReplayFromBackendEvent ignores events without replacement history', async () => {
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await DesktopConversationRuntimeClient.replaceCompactedReplayFromBackendEvent({
      conversationRef: 'conv-empty',
      userId: 'user-compact',
      event: {
        id: 'compaction-event',
        payload: {
          replacement_history_entries: [],
        },
      },
    });

    expect(mockReplaceCompactedReplay).not.toHaveBeenCalled();
  });
});
