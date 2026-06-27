/**
 * Covers desktop live turn runtime client. behavior in the frontend test suite.
 */

const mockGetActiveConversationRef = jest.fn(() => null);
const mockInvokeAgentSdkCommand = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
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
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
      workspacePath: '/workspace/project-alpha',
      resources: [{
        kind: 'readable_file',
        filePath: '/tmp/notes.txt',
        filename: 'notes.txt',
        required: true,
      }],
      turnRef: 'turn-explicit',
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
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('metadata');
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('model');
  });

  test('sendQuery omits padded workspace path instead of repairing it before SDK command dispatch', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
      workspacePath: ' /workspace/project-alpha ',
      turnRef: 'turn-explicit',
    });

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      workspace_path: null,
    }));
  });

  test('sendQuery ignores stale renderer model overrides before SDK command dispatch', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
      turnRef: 'turn-explicit',
      model: {
        modelProvider: 'openai',
        modelId: 'stale-renderer-override',
      },
    } as any);

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', expect.not.objectContaining({
      model: expect.anything(),
    }));
  });

  test('sendQuery keeps turn input resources on the positive SDK resource contract', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello with resources',
      conversationRef: 'conv-send',
      turnRef: 'turn-explicit',
      metadata: {
        attachment_context: 'renderer-owned context',
        attachment_filenames: ['notes.txt'],
        capture_meta: { displayId: 1 },
      },
      resources: [
        {
          kind: 'clipboard_image',
          displayAttachmentId: 'renderer-owned-id',
          base64: 'image-base64',
          contentType: ' image/png ',
          filename: 'shot.png',
          previewSrc: 'data:image/png;base64,preview',
          screenshotRef: 'artifact-should-not-cross',
          required: true,
        },
        {
          kind: 'clipboard_image',
          base64: 'valid-image-base64',
          contentType: 'image/png',
          filename: 'valid-shot.png',
          required: true,
        },
        {
          kind: 'query_screenshot_request',
          displayAttachmentId: 'renderer-screenshot-id',
          isFirstUserMessage: true,
          reason: ' capture ',
          previewSrc: 'data:image/png;base64,preview',
          required: false,
        },
        {
          kind: 'query_screenshot_request',
          isFirstUserMessage: true,
          reason: 'capture',
          required: false,
        },
        {
          kind: 'readable_file',
          filePath: ' /tmp/padded.txt ',
          filename: 'notes.txt',
          required: true,
        },
        {
          kind: 'workspace',
          workspacePath: ' /workspace/padded ',
          required: false,
        },
        {
          kind: 'unknown_resource',
          required: true,
        },
      ] as any,
    } as any);

    const commandPayload = mockInvokeAgentSdkCommand.mock.calls[0][1];
    expect(commandPayload).not.toHaveProperty('metadata');
    expect(commandPayload.resources).toEqual([
      {
        kind: 'clipboard_image',
        base64: 'valid-image-base64',
        contentType: 'image/png',
        filename: 'valid-shot.png',
        required: true,
      },
      {
        kind: 'query_screenshot_request',
        isFirstUserMessage: true,
        reason: 'capture',
        required: false,
      },
    ]);
    expect(JSON.stringify(commandPayload.resources)).not.toContain('displayAttachmentId');
    expect(JSON.stringify(commandPayload.resources)).not.toContain('previewSrc');
    expect(JSON.stringify(commandPayload.resources)).not.toContain('screenshotRef');
  });

  test('sendQuery rejects padded command identity before dispatch', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await expect(DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: ' conv-send ',
      turnRef: 'turn-explicit',
    })).rejects.toThrow('conversation.send requires exact non-empty conversationRef and turnRef values');
    await expect(DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
      turnRef: ' turn-explicit ',
    })).rejects.toThrow('conversation.send requires exact non-empty conversationRef and turnRef values');

    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('sendQuery throws a generic runtime fallback when command invoke fails without an error', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({ ok: false });
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await expect(DesktopLiveTurnRuntimeClient.sendQuery({
      text: 'hello',
      conversationRef: 'conv-send',
    })).rejects.toThrow('Failed to send command to the renderer app runtime');
  });

  test('stop routes through SDK-shaped command invoke with exact refs', async () => {
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop('conv-stop', 'turn-stop');

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });
  });

  test('stop ignores padded explicit refs without falling back to active conversation', async () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop(' conv-stop ', 'turn-stop');
    await DesktopLiveTurnRuntimeClient.stop('conv-stop', ' turn-stop ');

    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('stop falls back to the active conversation and nullable turn ref', async () => {
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop();

    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.stop', {
      conversation_ref: 'conv-active',
      turn_ref: null,
    });
  });

  test('stop ignores padded active conversation fallback refs', async () => {
    mockGetActiveConversationRef.mockReturnValue(' conv-active ');
    const { DesktopLiveTurnRuntimeClient } = require(
      '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient',
    );

    await DesktopLiveTurnRuntimeClient.stop();

    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

});
