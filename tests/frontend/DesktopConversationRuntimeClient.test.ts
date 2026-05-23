const mockLoadLocalConversationSnapshot = jest.fn();
const mockLoadRehydrateSnapshot = jest.fn();
const mockRehydrateFromStore = jest.fn();
const mockReplaceCompactedReplay = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    createSeededConversationStore: jest.fn(),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    loadLocalConversationSnapshot: (...args: unknown[]) => mockLoadLocalConversationSnapshot(...args),
    loadRehydrateSnapshot: (...args: unknown[]) => mockLoadRehydrateSnapshot(...args),
    rehydrateFromStore: (...args: unknown[]) => mockRehydrateFromStore(...args),
    replaceCompactedReplay: (...args: unknown[]) => mockReplaceCompactedReplay(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopBackendCommandRuntimeClient', () => ({
  DesktopBackendCommandRuntimeClient: {
    rehydrateConversation: jest.fn(),
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
    mockRehydrateFromStore.mockReset();
    mockReplaceCompactedReplay.mockReset();
    const { DesktopTranscriptProjectionRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient',
    );
    DesktopTranscriptProjectionRuntimeClient.recordUserMessage.mockReset();
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

  test('rehydrateFromStore delegates backend continuity to the SDK service facade', async () => {
    mockRehydrateFromStore.mockResolvedValueOnce({
      conversationRef: 'conv-sdk',
      revisionId: 'rev-1',
      messageCount: 2,
      hydrated: true,
    });
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await DesktopConversationRuntimeClient.rehydrateFromStore({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
      workspacePath: '/tmp/project',
    });

    expect(mockRehydrateFromStore).toHaveBeenCalledWith({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
      workspacePath: '/tmp/project',
    });
  });

  test('loadRehydrateSnapshot delegates snapshot loading to the SDK continuity service', async () => {
    mockLoadRehydrateSnapshot.mockResolvedValueOnce({
      conversationRef: 'conv-sdk',
      revisionId: 'rev-1',
      messages: [],
    });
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    await expect(DesktopConversationRuntimeClient.loadRehydrateSnapshot({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
    })).resolves.toMatchObject({
      conversationRef: 'conv-sdk',
    });

    expect(mockLoadRehydrateSnapshot).toHaveBeenCalledWith({
      conversationRef: 'conv-sdk',
      userId: 'user-1',
    });
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

  test('sendQuery records transcript rows and routes query payloads through the SDK transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );
    const { DesktopTranscriptProjectionRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient',
    );

    try {
      await DesktopConversationRuntimeClient.sendQuery({
        text: 'hello',
        conversationRef: 'conv-send',
        screenshotRef: ' artifact-main ',
        screenshotUrl: ' https://cdn.example/shot.png ',
        screenshotRefs: [' artifact-1 ', '   ', '', 'artifact-2'],
        captureMeta: { source: 'chat' },
        attachmentContext: ' file context ',
        attachmentFilenames: [' notes.txt ', '   ', 'image.png'],
        screenshot: ' inline-shot ',
        workspacePath: ' /workspace/WindieOS ',
        transcript: {
          userId: 'user-1',
          timestamp: '2026-05-22T12:00:00.000Z',
          screenshotRef: null,
        },
      });

      expect(DesktopTranscriptProjectionRuntimeClient.recordUserMessage).toHaveBeenCalledWith(
        'hello',
        {
          conversationRef: 'conv-send',
          userId: 'user-1',
          timestamp: '2026-05-22T12:00:00.000Z',
          screenshotRef: ' artifact-main ',
        },
      );
      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'query',
        payload: expect.objectContaining({
          text: 'hello',
          conversation_ref: 'conv-send',
          screenshot_ref: 'artifact-main',
          screenshot_url: 'https://cdn.example/shot.png',
          screenshot_refs: ['artifact-1', 'artifact-2'],
          capture_meta: { source: 'chat' },
          attachment_context: 'file context',
          attachment_filenames: ['notes.txt', 'image.png'],
          screenshot: 'inline-shot',
          workspace_path: '/workspace/WindieOS',
          memory_retrieval_enabled: true,
        }),
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('stop routes through the SDK runtime transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient',
    );

    try {
      await DesktopConversationRuntimeClient.stop('conv-stop');

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'stop-query',
        payload: {
          conversation_ref: 'conv-stop',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });
});
