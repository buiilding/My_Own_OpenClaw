/**
 * Covers desktop agent runtime transport behavior in the frontend test suite.
 */

import { createDesktopAgentRuntimeTransport } from '../../frontend/src/renderer/app/runtime/desktopAgentRuntimeTransport';
import { invokeAgentSdkCommand } from '../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient';

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  invokeAgentSdkCommand: jest.fn(),
}));

const mockInvokeAgentSdkCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;

describe('desktopAgentRuntimeTransport', () => {
  afterEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
    jest.restoreAllMocks();
  });

  test('rejects sendQuery when main reports a query dispatch failure', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: false,
      error: 'Failed to send query through agent runtime',
    });

    const transport = createDesktopAgentRuntimeTransport('/repo');

    await expect(transport.sendQuery({
      text: 'retry this',
      conversation_ref: 'conv-1',
    })).rejects.toThrow('Failed to send query through agent runtime');
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      text: 'retry this',
      conversation_ref: 'conv-1',
      workspace_path: '/repo',
    }));
  });

  test('resolves sendQuery when main accepts the query dispatch', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopAgentRuntimeTransport(null);

    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
    }, {
      messageId: 'turn-1',
    })).resolves.toBe('msg-1');
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
      text: 'hello',
      conversation_ref: 'conv-1',
      query_message_id: 'turn-1',
    }));
    expect(mockInvokeAgentSdkCommand.mock.calls[0][1]).not.toHaveProperty('turn_ref');
  });

  test('does not map removed camelCase query payload aliases', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopAgentRuntimeTransport(null);

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
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('conversation.send', expect.objectContaining({
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
    mockInvokeAgentSdkCommand.mockResolvedValue({});
    const transport = createDesktopAgentRuntimeTransport('/repo');

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

    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(1, 'conversation.rehydrate', {
      conversation_ref: 'conv-r',
      messages: [{ role: 'user', content: 'hello' }],
      rehydrate_mode: 'replace',
      workspace_path: '/repo',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(2, 'conversation.compact', {
      force: false,
      conversation_ref: 'conv-c',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(3, 'wakeword.detected', {
      turn_ref: 'turn-wake',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(4, 'settings.update', {
      model: 'model-1',
    });
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(5, 'models.list');
    expect(mockInvokeAgentSdkCommand).toHaveBeenNthCalledWith(6, 'conversation.stop', {
      conversation_ref: 'conv-stop',
      turn_ref: 'turn-stop',
    });
  });
});
