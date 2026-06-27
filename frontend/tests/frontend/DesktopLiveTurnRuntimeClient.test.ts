/**
 * Covers desktop live turn runtime client. behavior in the frontend test suite.
 */

const mockGetActiveConversationRef = jest.fn(() => null);
const mockInvokeAgentSdkCommand = jest.fn();

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
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
    mockInvokeAgentSdkCommand.mockReset();
    mockInvokeAgentSdkCommand.mockResolvedValue({ ok: true, messageId: 'turn-accepted' });
  });

  test('sendQuery routes canonical query payload fields through SDK-shaped command invoke', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
      workspacePath: ' /workspace/project-alpha ',
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      metadata: {
        source: 'renderer',
      },
      turnRef: ' turn-explicit ',
    });

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', {
      text: 'hello',
      conversation_ref: 'conv-send',
      workspace_path: '/workspace/project-alpha',
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      metadata: {
        source: 'renderer',
      },
      query_message_id: 'turn-explicit',
      memory_retrieval_enabled: true,
    });
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('turn_ref');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('screenshot_ref');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('screenshot_url');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('screenshot_refs');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('capture_meta');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('attachment_context');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('attachment_filenames');
  });

  test('sendQuery throws a generic runtime fallback when command invoke fails without an error', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({ ok: false });
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await expect(DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
    })).rejects.toThrow('Failed to send command to the renderer app runtime');
  });

  test('stop routes through SDK-shaped command invoke with the active turn ref', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop('conv-stop', ' turn-stop ');

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });
  });

  test('stop falls back to the active conversation and nullable turn ref', async () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop();

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-active',
      turn_ref: null,
    });
  });

});
