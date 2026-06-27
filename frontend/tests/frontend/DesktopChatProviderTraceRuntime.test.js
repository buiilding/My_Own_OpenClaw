/**
 * Covers chat-provider trace snapshot runtime behavior.
 */

import { DesktopChatProviderTraceRuntime } from '../../src/renderer/app/runtime/desktopChatProviderTraceRuntime';

const {
  buildChatProviderTraceWorkspaceSnapshot,
} = DesktopChatProviderTraceRuntime;

describe('DesktopChatProviderTraceRuntime', () => {
  test('builds trace snapshots from ConversationView before raw workspace messages', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messages: [{
          id: 'stale-message',
          sender: 'assistant',
          text: 'stale raw answer',
          turnRef: 'turn-stale',
          sourceEventType: 'streaming-response',
        }],
        streamTracking: {
          activeTurnRef: 'turn-stale',
        },
        conversationView: {
          liveTurn: {
            turnRef: 'turn-view',
          },
          displayRows: [{
            id: 'view-row',
            role: 'assistant',
            type: 'assistant_message',
            content: 'view answer',
            turnRef: 'turn-view',
            sourceEventType: 'assistant-message-full',
          }],
        },
      },
    })).toEqual({
      activeConversationRef: 'conv-provider',
      workspaceMessageCount: 1,
      activeTurnRef: 'turn-view',
      lastMessage: {
        sender: 'assistant',
        type: 'assistant_message',
        textLength: 'view answer'.length,
        turnRef: 'turn-view',
        sourceEventType: 'assistant-message-full',
      },
    });
  });

  test('falls back to raw workspace messages when no ConversationView rows exist', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messages: [{
          id: 'raw-message',
          sender: 'assistant',
          type: 'llm-text',
          text: 'raw answer',
          turnRef: 'turn-raw',
          sourceEventType: 'streaming-response',
        }],
        streamTracking: {
          activeTurnRef: 'turn-raw',
        },
        conversationView: null,
      },
    })).toEqual({
      activeConversationRef: 'conv-provider',
      workspaceMessageCount: 1,
      activeTurnRef: 'turn-raw',
      lastMessage: {
        sender: 'assistant',
        type: 'llm-text',
        textLength: 'raw answer'.length,
        turnRef: 'turn-raw',
        sourceEventType: 'streaming-response',
      },
    });
  });
});
