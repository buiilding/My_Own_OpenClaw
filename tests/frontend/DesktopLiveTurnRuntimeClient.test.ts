/**
 * Covers desktop live turn runtime client. behavior in the frontend test suite.
 */

const mockGetActiveConversationRef = jest.fn(() => null);
const mockInvokeWindieCommand = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeWindieCommand(...args),
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

describe('DesktopLiveTurnRuntimeClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
    mockInvokeWindieCommand.mockReset();
    mockInvokeWindieCommand.mockResolvedValue({ ok: true, messageId: 'turn-accepted' });
  });

  test('sendQuery routes query payloads through SDK-shaped command invoke', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

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
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      metadata: {
        attachmentFilenames: ['notes.txt'],
      },
      turnRef: ' turn-explicit ',
    });

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.send', {
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
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      metadata: {
        attachmentFilenames: ['notes.txt'],
      },
      id: 'turn-explicit',
      messageId: 'turn-explicit',
      message_id: 'turn-explicit',
      query_message_id: 'turn-explicit',
      memory_retrieval_enabled: true,
    });
    expect(mockInvokeWindieCommand.mock.calls[0][1]).not.toHaveProperty('turn_ref');
  });

  test('stop routes through SDK-shaped command invoke with the active turn ref', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop('conv-stop', ' turn-stop ');

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });
  });

  test('stop falls back to the active conversation and nullable turn ref', async () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop();

    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-active',
      turn_ref: null,
    });
  });

});
