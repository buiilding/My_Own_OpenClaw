/**
 * Covers chat provider. behavior in the frontend test suite.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';

import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import { ChatProvider } from '../../src/renderer/app/providers/ChatProvider';
import { DesktopRendererTraceRuntime } from '../../src/renderer/app/runtime/desktopRendererTraceRuntime';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';

const mockUseChatStream = jest.fn();
const mockUseTranscriptSessionInfo = jest.fn();
const mockBootstrapSession = jest.fn().mockResolvedValue({ conversationRef: null, userId: null });
const mockIpcOn = jest.fn(() => jest.fn());
const DEFAULT_CHAT_WORKSPACE_REF = '__default__';
const {
  resetRendererTurnConversationRefs,
} = DesktopChatTurnConversationRefRuntime;
const {
  logRendererChatPillTrace,
} = DesktopRendererTraceRuntime;

function setSearch(search) {
  window.history.replaceState({}, '', `/${search}`);
}

function createInitialStreamTracking() {
  return {
    activeTurnRef: null,
    phase: 'idle',
    startedAt: null,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: null,
    lastEventType: null,
    eventCount: 0,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

jest.mock('../../src/renderer/features/chat/hooks/useChatStream', () => ({
  useChatStream: (...args) => mockUseChatStream(...args),
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient', () => ({
  DesktopTranscriptSessionInfoRuntimeClient: {
    useDesktopTranscriptSessionInfo: () => mockUseTranscriptSessionInfo(),
  },
}));

jest.mock('../../src/renderer/features/chat/hooks/useChatSessionBootstrap', () => ({
  useChatSessionBootstrap: () => mockBootstrapSession,
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (...args) => mockIpcOn(...args),
  },
  ON_CHANNELS: {
    IPC_STATUS: 'ipc-status',
  },
}));

function resetChatStore() {
  resetRendererTurnConversationRefs();
  useChatStore.setState({
    activeConversationRef: null,
    workspaces: {
      [DEFAULT_CHAT_WORKSPACE_REF]: {
        messages: [],
        isSending: false,
        thinkingStatus: null,
        thinkingSourceEventType: null,
        tokenCounts: null,
        streamTracking: createInitialStreamTracking(),
      },
    },
    messages: [],
    isSending: false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    tokenCounts: null,
    streamTracking: createInitialStreamTracking(),
  });
}

describe('ChatProvider', () => {
  beforeEach(() => {
    mockUseChatStream.mockReset();
    mockUseTranscriptSessionInfo.mockReset();
    mockBootstrapSession.mockClear();
    mockIpcOn.mockReset();
    mockIpcOn.mockReturnValue(jest.fn());
    setSearch('');
    resetChatStore();
  });

  test('syncs active conversation from transcript session for overlay surfaces', async () => {
    mockUseTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-overlay-1',
      userId: 'peter',
    });

    render(
      <ChatProvider enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    expect(mockUseChatStream).toHaveBeenCalledWith(false);
    expect(mockBootstrapSession).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-overlay-1');
    });
  });

  test('mounts chat stream with transcript enabled by default', () => {
    mockUseTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'peter',
    });

    render(
      <ChatProvider>
        <div>main app</div>
      </ChatProvider>,
    );

    expect(mockUseChatStream).toHaveBeenCalledWith(true);
  });

  test('does not clear active conversation when transcript session conversation ref is null', async () => {
    useChatStore.getState().setActiveConversationRef('conv-previous');
    mockUseTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'peter',
    });

    render(
      <ChatProvider enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-previous');
    });
  });

  test('updates active conversation when transcript session changes', async () => {
    const session = { conversationRef: 'conv-a', userId: 'peter' };
    mockUseTranscriptSessionInfo.mockImplementation(() => session);

    const { rerender } = render(
      <ChatProvider enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-a');
    });

    session.conversationRef = 'conv-b';
    rerender(
      <ChatProvider enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-b');
    });
  });

  test('enriches trace snapshots from ConversationView before raw workspace messages', () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    setSearch('?debug_chat_pill=1&view=minimal-chat-pill');
    useChatStore.setState({
      activeConversationRef: 'conv-provider',
      workspaces: {
        [DEFAULT_CHAT_WORKSPACE_REF]: {
          messages: [],
          isSending: false,
          thinkingStatus: null,
          thinkingSourceEventType: null,
          tokenCounts: null,
          streamTracking: createInitialStreamTracking(),
        },
        'conv-provider': {
          messages: [{
            id: 'stale-message',
            sender: 'assistant',
            text: 'stale raw answer',
            turnRef: 'turn-stale',
            sourceEventType: 'streaming-response',
          }],
          isSending: false,
          thinkingStatus: null,
          thinkingSourceEventType: null,
          tokenCounts: null,
          streamTracking: {
            ...createInitialStreamTracking(),
            activeTurnRef: 'turn-stale',
          },
          sdkLiveTurn: null,
          pendingTurn: null,
          conversationView: {
            conversationRef: 'conv-provider',
            revisionId: 'rev-provider',
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
      },
    });

    try {
      logRendererChatPillTrace({ event: 'provider-trace' }, 'conv-provider');

      expect(consoleLog).toHaveBeenCalledWith(
        '[ChatPillTrace][renderer]',
        expect.objectContaining({
          event: 'provider-trace',
          workspaceMessageCount: 1,
          activeTurnRef: 'turn-view',
          lastMessage: expect.objectContaining({
            sender: 'assistant',
            type: 'assistant_message',
            textLength: 'view answer'.length,
            turnRef: 'turn-view',
            sourceEventType: 'assistant-message-full',
          }),
        }),
      );
    } finally {
      consoleLog.mockRestore();
    }
  });

});
