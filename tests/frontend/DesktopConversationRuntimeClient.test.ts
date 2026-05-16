const mockLoadRehydrateSnapshot = jest.fn();
const mockRehydrateConversation = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    loadRehydrateSnapshot: (...args: unknown[]) => mockLoadRehydrateSnapshot(...args),
    createSeededConversationStore: jest.fn(),
    recordUserMessage: jest.fn(),
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
    replaceCompactedReplay: jest.fn(),
  },
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
    mockRehydrateConversation.mockReset();
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
});
