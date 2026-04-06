import {
  buildAssistantTextChatMessageState,
} from '../../frontend/src/renderer/infrastructure/transcript/assistantTextChatMessageState';

describe('assistantTextChatMessageState', () => {
  test('builds a canonical assistant llm-text message and omits absent fields', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('assistant-text-1');

    expect(buildAssistantTextChatMessageState({
      text: 'reply',
      sourceEventType: 'streaming-response',
      sourceChannel: 'from-backend',
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      isComplete: false,
      thinkingText: 'thinking',
      thinkingSourceEventType: 'llm-thought',
    })).toEqual({
      id: 'assistant-text-1',
      text: 'reply',
      sender: 'assistant',
      type: 'llm-text',
      sourceEventType: 'streaming-response',
      sourceChannel: 'from-backend',
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      isComplete: false,
      thinkingText: 'thinking',
      thinkingSourceEventType: 'llm-thought',
    });

    uuidSpy.mockRestore();
  });
});
