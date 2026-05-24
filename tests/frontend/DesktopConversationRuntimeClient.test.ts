const mockLoadLocalConversationSnapshot = jest.fn();
const mockLoadRehydrateSnapshot = jest.fn();
const mockRehydrateFromStore = jest.fn();
const mockGetActiveConversationRef = jest.fn(() => null);

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    createSeededConversationStore: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    loadLocalConversationSnapshot: (...args: unknown[]) => mockLoadLocalConversationSnapshot(...args),
    loadRehydrateSnapshot: (...args: unknown[]) => mockLoadRehydrateSnapshot(...args),
    rehydrateFromStore: (...args: unknown[]) => mockRehydrateFromStore(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: (...args: unknown[]) => mockGetActiveConversationRef(...args),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: null,
      userId: null,
    })),
    setActiveConversationRef: jest.fn(),
    updateTranscriptSession: jest.fn(),
  },
}));

describe('DesktopConversationRuntimeClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockLoadRehydrateSnapshot.mockReset();
    mockLoadLocalConversationSnapshot.mockReset();
    mockRehydrateFromStore.mockReset();
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
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

  test('sendQuery routes query payloads through the SDK transport', async () => {
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
      });

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

  test('rehydrate routes replace-mode history through the SDK transport', async () => {
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
      await DesktopConversationRuntimeClient.rehydrate({
        conversationRef: 'conv-rehydrate',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi', message_type: 'assistant' },
        ],
        workspacePath: ' /workspace/WindieOS ',
      });

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'rehydrate',
        payload: {
          conversation_ref: 'conv-rehydrate',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi', message_type: 'assistant' },
          ],
          rehydrate_mode: 'replace',
          workspace_path: '/workspace/WindieOS',
        },
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

  test('compactHistory routes through the SDK runtime transport', async () => {
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
      await DesktopConversationRuntimeClient.compactHistory(false, 'conv-compact');

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'compact-history',
        payload: {
          force: false,
          conversation_ref: 'conv-compact',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('compactHistory falls back to the active conversation ref', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    mockGetActiveConversationRef.mockReturnValue('conv-active');
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
      await DesktopConversationRuntimeClient.compactHistory();

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'compact-history',
        payload: {
          force: true,
          conversation_ref: 'conv-active',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

});
