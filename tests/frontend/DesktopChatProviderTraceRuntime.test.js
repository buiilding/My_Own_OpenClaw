/**
 * Covers chat-provider trace snapshot runtime behavior.
 */

import { DesktopChatProviderTraceRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatProviderTraceRuntime';

const {
  buildChatProviderTraceWorkspaceSnapshot,
} = DesktopChatProviderTraceRuntime;

describe('DesktopChatProviderTraceRuntime', () => {
  test('builds trace snapshots from ConversationView summaries before raw workspace messages', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messageCount: 99,
        activeTurnRef: 'turn-stale',
        lastMessage: {
          sender: 'assistant',
          type: 'llm-text',
          textLength: 'stale raw answer'.length,
          turnRef: 'turn-stale',
          sourceEventType: 'streaming-response',
        },
        conversationViewTraceSummary: {
          displayRowCount: 1,
          liveTurnRef: 'turn-view',
          lastMessage: {
            sender: 'assistant',
            type: 'assistant_message',
            textLength: 'view answer'.length,
            turnRef: 'turn-view',
            sourceEventType: 'assistant-message-full',
          },
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

  test('does not fall back to raw workspace fields when ConversationView summary has no rows', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messageCount: 99,
        activeTurnRef: 'turn-stale',
        lastMessage: {
          sender: 'assistant',
          type: 'llm-text',
          textLength: 'stale raw answer'.length,
          turnRef: 'turn-stale',
          sourceEventType: 'streaming-response',
        },
        conversationViewTraceSummary: {
          displayRowCount: 0,
          liveTurnRef: null,
          lastMessage: null,
        },
      },
    })).toEqual({
      activeConversationRef: 'conv-provider',
      workspaceMessageCount: 0,
      activeTurnRef: null,
      lastMessage: null,
    });
  });

  test('uses no-view trace read model when no ConversationView exists', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messageCount: 1,
        activeTurnRef: 'turn-raw',
        lastMessage: {
          sender: 'assistant',
          type: 'llm-text',
          textLength: 'raw answer'.length,
          turnRef: 'turn-raw',
          sourceEventType: 'streaming-response',
        },
        conversationViewTraceSummary: null,
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

  test('falls back to no-view trace read model when no ConversationView summary exists', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messageCount: 1,
        activeTurnRef: 'turn-raw',
        lastMessage: {
          sender: 'assistant',
          type: 'llm-text',
          textLength: 'raw answer'.length,
          turnRef: 'turn-raw',
          sourceEventType: 'streaming-response',
        },
        conversationViewTraceSummary: null,
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

  test('does not repair padded raw trace identity without ConversationView', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messageCount: 1,
        activeTurnRef: ' turn-raw ',
        lastMessage: {
          sender: 'assistant',
          type: 'llm-text',
          textLength: 'raw answer'.length,
          turnRef: ' turn-raw ',
          sourceEventType: ' streaming-response ',
        },
        conversationViewTraceSummary: null,
      },
    })).toEqual({
      activeConversationRef: 'conv-provider',
      workspaceMessageCount: 1,
      activeTurnRef: null,
      lastMessage: {
        sender: 'assistant',
        type: 'llm-text',
        textLength: 'raw answer'.length,
        turnRef: null,
        sourceEventType: null,
      },
    });
  });
});
