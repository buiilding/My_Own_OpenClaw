import { buildAssistantTranscriptTransparency } from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamTransparency';
import type { ChatMessage } from '../../frontend/src/renderer/features/chat/stores/chatStore';

function createUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'user-1',
    sender: 'user',
    text: 'hello',
    ...overrides,
  };
}

function createAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    sender: 'assistant',
    text: 'hi',
    ...overrides,
  };
}

describe('buildAssistantTranscriptTransparency', () => {
  test('builds transparency payload from turn-matched user message and assistant full content', () => {
    const messages: ChatMessage[] = [
      createUserMessage({
        id: 'user-other',
        turnRef: 'turn-old',
        systemPrompt: { content: ' old ' },
      }),
      createUserMessage({
        id: 'user-current',
        turnRef: 'turn-1',
        systemPrompt: {
          content: ' system prompt ',
          toolSchemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
        },
        fullUserMessage: { content: ' full user ', metadata: { source: 'manual' } },
      }),
      createAssistantMessage({ id: 'assistant-1', turnRef: 'turn-1' }),
    ];

    const transparency = buildAssistantTranscriptTransparency(
      messages,
      createAssistantMessage({
        id: 'assistant-final',
        fullAssistantMessage: { content: ' full assistant ' },
      }),
      'turn-1',
    );

    expect(transparency).toEqual({
      systemPrompt: 'system prompt',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: 'full user',
        metadata: { source: 'manual' },
      },
      fullAssistantMessage: { content: 'full assistant' },
    });
  });

  test('prefers explicit user toolSchemas when both message and system prompt provide schemas', () => {
    const messages: ChatMessage[] = [
      createUserMessage({
        turnRef: 'turn-2',
        toolSchemas: [{ type: 'function', name: 'from-user', parameters: { type: 'object' } }],
        systemPrompt: {
          content: 'prompt',
          toolSchemas: [{ type: 'function', function: { name: 'from-system', parameters: { type: 'object' } } }],
        },
      }),
    ];

    const transparency = buildAssistantTranscriptTransparency(
      messages,
      createAssistantMessage(),
      'turn-2',
    );

    expect(transparency?.toolSchemas).toEqual([
      { type: 'function', function: { name: 'from-user', parameters: { type: 'object' } } },
    ]);
  });

  test('returns undefined when no useful transparency fields are available', () => {
    const messages: ChatMessage[] = [
      createUserMessage({
        fullUserMessage: { content: '   ' },
        systemPrompt: { content: '  ', toolSchemas: [] },
      }),
    ];

    const transparency = buildAssistantTranscriptTransparency(
      messages,
      createAssistantMessage({
        fullAssistantMessage: { content: '   ' },
      }),
      'turn-empty',
    );

    expect(transparency).toBeUndefined();
  });
});
