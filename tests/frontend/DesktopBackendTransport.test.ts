/**
 * Covers desktop backend transport. behavior in the frontend test suite.
 */

import { createDesktopBackendTransport } from '../../frontend/src/renderer/app/runtime/desktopBackendTransport';
import { invokeAgentSdkCommand } from '../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  invokeAgentSdkCommand: jest.fn(),
}));

const mockInvokeWindieCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;

describe('desktopBackendTransport', () => {
  afterEach(() => {
    mockInvokeWindieCommand.mockReset();
    jest.restoreAllMocks();
  });

  test('rejects sendQuery when main reports a query dispatch failure', async () => {
    mockInvokeWindieCommand.mockResolvedValue({
      ok: false,
      error: 'Failed to send query to backend',
    });

    const transport = createDesktopBackendTransport('/repo');

    await expect(transport.sendQuery({
      text: 'retry this',
      conversation_ref: 'conv-1',
    })).rejects.toThrow('Failed to send query to backend');
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      text: 'retry this',
      conversation_ref: 'conv-1',
      workspace_path: '/repo',
    }));
  });

  test('resolves sendQuery when main accepts the query dispatch', async () => {
    mockInvokeWindieCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopBackendTransport(null);

    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
    }, {
      messageId: 'turn-1',
    })).resolves.toBe('msg-1');
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      text: 'hello',
      conversation_ref: 'conv-1',
      query_message_id: 'turn-1',
    }));
    expect(mockInvokeWindieCommand.mock.calls[0][1]).not.toHaveProperty('turn_ref');
  });

  test('does not map removed camelCase query payload aliases', async () => {
    mockInvokeWindieCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopBackendTransport(null);

    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: '',
      conversationRef: 'conv-camel',
      screenshotRef: 'shot-camel',
      screenshotUrl: 'https://cdn.example/shot.png',
      screenshotRefs: ['shot-camel'],
      attachmentContext: 'context',
      attachmentFilenames: ['shot.png'],
      workspacePath: '/repo',
    })).resolves.toBe('msg-1');
    expect(mockInvokeWindieCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      text: 'hello',
      conversation_ref: '',
      screenshot_ref: null,
      screenshot_url: null,
      screenshot_refs: null,
      attachment_context: null,
      attachment_filenames: null,
      workspace_path: null,
    }));
  });

  test('routes runtime commands through SDK-shaped command invoke', async () => {
    mockInvokeWindieCommand.mockResolvedValue({});
    const transport = createDesktopBackendTransport('/repo');

    await transport.rehydrateConversation({
      conversation_ref: 'conv-r',
      messages: [{ role: 'user', content: 'hello' }],
    });
    await transport.compactHistory({
      conversation_ref: 'conv-c',
      force: false,
    });
    await transport.wakewordDetected({ turn_ref: 'turn-wake' });
    await transport.updateSettings({ model: 'model-1' });
    await transport.listModels();
    await transport.stop({
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });

    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(1, 'conversation.rehydrate', {
      conversation_ref: 'conv-r',
      messages: [{ role: 'user', content: 'hello' }],
      rehydrate_mode: 'replace',
      workspace_path: '/repo',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(2, 'conversation.compact', {
      force: false,
      conversation_ref: 'conv-c',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(3, 'wakeword.detected', {
      turn_ref: 'turn-wake',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(4, 'settings.update', {
      model: 'model-1',
    });
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(5, 'models.list');
    expect(mockInvokeWindieCommand).toHaveBeenNthCalledWith(6, 'conversation.stop', {
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });
  });
});
