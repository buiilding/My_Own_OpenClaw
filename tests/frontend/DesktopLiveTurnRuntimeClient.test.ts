const mockGetActiveConversationRef = jest.fn(() => null);

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

describe('DesktopLiveTurnRuntimeClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
  });

  test('sendQuery routes query payloads through the SDK transport', async () => {
    const send = jest.fn();
    const invoke = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    try {
      await DesktopLiveTurnRuntimeClient.sendQuery({
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

      expect(send).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith('windie:send', {
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
        query_message_id: expect.stringMatching(/^turn_/),
        memory_retrieval_enabled: true,
      });
      expect(invoke.mock.calls[0][1]).not.toHaveProperty('turn_ref');
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('stop routes through the SDK runtime transport', async () => {
    const send = jest.fn();
    const invoke = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    try {
      await DesktopLiveTurnRuntimeClient.stop('conv-stop');

      expect(send).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith('windie:stop', {
        conversation_ref: 'conv-stop',
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

});
