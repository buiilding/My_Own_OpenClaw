/**
 * Covers chat-provider trace snapshot runtime behavior.
 */

import { DesktopChatProviderTraceRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatProviderTraceRuntime';

const {
  buildChatProviderTraceWorkspaceSnapshot,
} = DesktopChatProviderTraceRuntime;

function conversationView({
  conversationRef = 'conv-provider',
  displayRows = [],
  liveTurn = {
    turnRef: 'turn-view',
  },
  surfaces = {
    dashboard: { mode: 'normal', visible: true },
    pill: { mode: 'normal', visible: true },
    responseOverlay: { mode: 'hidden', visible: false },
  },
  actions = {
    canEdit: false,
    canRetry: false,
    canFork: false,
  },
} = {}) {
  return {
    conversationRef,
    revisionId: null,
    displayRows,
    liveTurn,
    surfaces,
    actions,
  };
}

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
        conversationView: conversationView({
          displayRows: [{
            id: 'view-row',
            role: 'assistant',
            type: 'assistant_message',
            content: 'view answer',
            turnRef: 'turn-view',
            sourceEventType: 'assistant-message-full',
          }],
        }),
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

  test('does not fall back to raw workspace fields when ConversationView has no rows', () => {
    expect(buildChatProviderTraceWorkspaceSnapshot({
      activeConversationRef: 'conv-provider',
      workspace: {
        messages: [{
          id: 'stale-message',
          sender: 'assistant',
          type: 'llm-text',
          text: 'stale raw answer',
          turnRef: 'turn-stale',
          sourceEventType: 'streaming-response',
        }],
        streamTracking: {
          activeTurnRef: 'turn-stale',
        },
        conversationView: conversationView({
          liveTurn: {},
          displayRows: [],
        }),
      },
    })).toEqual({
      activeConversationRef: 'conv-provider',
      workspaceMessageCount: 0,
      activeTurnRef: null,
      lastMessage: null,
    });
  });

  test('falls back to raw workspace messages when no ConversationView exists', () => {
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

  test('falls back to raw workspace fields for incomplete ConversationView envelopes', () => {
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
        conversationView: {
          displayRows: [{
            id: 'view-row',
            role: 'assistant',
            type: 'assistant_message',
            content: 'partial view answer',
            turnRef: 'turn-view',
          }],
        },
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
        messages: [{
          id: 'raw-message',
          sender: 'assistant',
          type: 'llm-text',
          text: 'raw answer',
          turnRef: ' turn-raw ',
          sourceEventType: ' streaming-response ',
        }],
        streamTracking: {
          activeTurnRef: ' turn-raw ',
        },
        conversationView: null,
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
