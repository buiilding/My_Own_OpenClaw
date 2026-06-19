/**
 * Covers renderer app-runtime SDK display projection merge rules.
 */

import {
  buildChatMessagesFromSdkDisplayRows,
  mergeRendererAnnotationsIntoSdkMessages,
} from '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection';
import type { ChatMessage } from '../../frontend/src/renderer/app/runtime/desktopChatMessageTypes';

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? 'message-id',
    sender: overrides.sender ?? 'assistant',
    text: overrides.text ?? '',
    ...overrides,
  };
}

describe('desktopConversationDisplayProjection', () => {
  test('projects SDK display rows through the renderer app-runtime facade', () => {
    expect(buildChatMessagesFromSdkDisplayRows([{
      id: 'row-user',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      index: 0,
      role: 'user',
      type: 'user_message',
      content: 'inspect recent commits',
    }])).toEqual([
      expect.objectContaining({
        id: 'row-user',
        sender: 'user',
        text: 'inspect recent commits',
      }),
    ]);
  });

  test('merges renderer-only annotations back into matching SDK messages', () => {
    const sdkAssistant = message({
      id: 'assistant-1',
      sender: 'assistant',
      text: 'Visible answer',
      turnRef: 'turn-1',
    });
    const currentAssistant = message({
      id: 'assistant-1',
      sender: 'assistant',
      text: 'Old answer',
      turnRef: 'turn-1',
      systemPrompt: {
        content: 'System prompt',
      },
      toolSchemas: [{
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {},
        },
      }],
      fullAssistantMessage: {
        content: 'Full assistant text',
      },
      feedback: 'like',
      tokenCounts: {
        usage_source: 'provider',
        total_tokens: 42,
      },
    });

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkAssistant],
      [currentAssistant],
    )).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'Visible answer',
        systemPrompt: currentAssistant.systemPrompt,
        toolSchemas: currentAssistant.toolSchemas,
        fullAssistantMessage: currentAssistant.fullAssistantMessage,
        feedback: 'like',
        tokenCounts: currentAssistant.tokenCounts,
      }),
    ]);
  });

  test('preserves optimistic user rows until SDK display rows project that turn', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkToolCall = message({
      id: 'tool-row',
      sender: 'assistant',
      type: 'tool-call',
      text: '',
      turnRef: 'turn-1',
      sourceEventType: 'tool_call',
    });

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkToolCall],
      [optimisticUser],
    )).toEqual([
      optimisticUser,
      sdkToolCall,
    ]);
  });

  test('does not duplicate optimistic user rows when SDK projected the same id or turn', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkUserSameId = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      isComplete: true,
    });
    const sdkUserSameTurn = message({
      id: 'sdk-user-1',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      isComplete: true,
    });

    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkUserSameId],
      [optimisticUser],
    )).toEqual([sdkUserSameId]);
    expect(mergeRendererAnnotationsIntoSdkMessages(
      [sdkUserSameTurn],
      [optimisticUser],
    )).toEqual([sdkUserSameTurn]);
  });
});
