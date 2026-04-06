import {
  buildToolCallChatMessageState,
} from '../../frontend/src/renderer/infrastructure/transcript/toolCallChatMessageState';

describe('toolCallChatMessageState', () => {
  test('builds a canonical tool-call chat message and omits absent optionals', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('tool-call-state-1');

    expect(buildToolCallChatMessageState({
      text: 'tool call text',
      toolCallDisplayText: 'tool call text',
      modelFacingToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
      },
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'req-1',
      sourceEventType: 'tool-call',
      sourceChannel: 'from-backend',
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      isComplete: true,
    })).toEqual({
      id: 'tool-call-state-1',
      text: 'tool call text',
      sender: 'assistant',
      type: 'tool-call',
      toolCallDisplayText: 'tool call text',
      modelFacingToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
      },
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'req-1',
      sourceEventType: 'tool-call',
      sourceChannel: 'from-backend',
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      isComplete: true,
    });

    uuidSpy.mockRestore();
  });
});
