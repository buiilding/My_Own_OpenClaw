/**
 * Covers SDK desktop transport adapter behavior in the frontend test suite.
 */

import { DesktopRuntimeTransport } from '../../src/renderer/app/runtime/desktopRuntimeTransport';
import { AgentSdkCommandInvokeClient } from '../../src/renderer/app/runtime/agentSdkCommandInvokeClient';

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: jest.fn(),
  },
}));

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;
const {
  createDesktopRuntimeTransport,
} = DesktopRuntimeTransport;
const mockInvokeAgentSdkCommand = invokeAgentSdkCommand as jest.MockedFunction<typeof invokeAgentSdkCommand>;

describe('desktopRuntimeTransport', () => {
  afterEach(() => {
    mockInvokeAgentSdkCommand.mockReset();
    jest.restoreAllMocks();
  });

  test('rejects sendQuery when main reports a query dispatch failure', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: false,
      error: 'Failed to send query through agent runtime',
    });

    const transport = createDesktopRuntimeTransport('/repo');

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

    const transport = createDesktopRuntimeTransport(null);

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

  test('rejects removed camelCase query payload aliases', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopRuntimeTransport(null);

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
    })).rejects.toThrow(
      'conversation.send received removed camelCase field(s): conversationRef, screenshotRef, screenshotUrl, screenshotRefs, attachmentContext, attachmentFilenames, workspacePath. Use canonical snake_case fields.',
    );
    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('rejects removed query message id payload aliases', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({
      ok: true,
      messageId: 'msg-1',
    });

    const transport = createDesktopRuntimeTransport(null);

    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
      queryMessageId: 'turn-camel',
      messageId: 'turn-message',
    })).rejects.toThrow(
      'conversation.send received removed camelCase field(s): queryMessageId, messageId. Use canonical snake_case fields.',
    );
    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
      message_id: 'turn-snake',
    })).rejects.toThrow(
      'conversation.send received removed field(s): message_id. Use query_message_id.',
    );
    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
      id: 'turn-id',
    })).rejects.toThrow(
      'conversation.send received removed id field. Use query_message_id.',
    );
    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('rejects removed camelCase stop payload aliases', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({});

    const transport = createDesktopRuntimeTransport(null);

    await expect(transport.stop({
      conversationRef: 'conv-camel',
      turnRef: 'turn-camel',
    })).rejects.toThrow(
      'conversation.stop received removed camelCase field(s): conversationRef, turnRef. Use canonical snake_case fields.',
    );
    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('rejects removed camelCase rehydrate and compact payload aliases', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({});

    const transport = createDesktopRuntimeTransport(null);

    await expect(transport.rehydrateConversation({
      conversationRef: 'conv-camel',
      workspacePath: '/repo-camel',
      messages: [],
    })).rejects.toThrow(
      'conversation.rehydrate received removed camelCase field(s): conversationRef, workspacePath. Use canonical snake_case fields.',
    );
    await expect(transport.compactHistory({
      conversationRef: 'conv-camel',
      turnRef: 'turn-camel',
    })).rejects.toThrow(
      'conversation.compact received removed camelCase field(s): conversationRef, turnRef. Use canonical snake_case fields.',
    );
    expect(mockInvokeAgentSdkCommand).not.toHaveBeenCalled();
  });

  test('routes runtime commands through SDK-shaped command invoke', async () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({});
    const transport = createDesktopRuntimeTransport('/repo');

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
