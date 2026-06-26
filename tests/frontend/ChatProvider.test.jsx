/**
 * Covers chat provider. behavior in the frontend test suite.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';

import {
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { ChatProvider } from '../../frontend/src/renderer/app/providers/ChatProvider';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';

const mockUseChatStream = jest.fn();
const mockUseTranscriptSessionInfo = jest.fn();
const mockBootstrapSession = jest.fn().mockResolvedValue({ conversationRef: null, userId: null });
const mockIpcOn = jest.fn(() => jest.fn());
const DEFAULT_CHAT_WORKSPACE_REF = '__default__';
const {
  resetRendererTurnConversationRefs,
} = DesktopChatTurnConversationRefRuntime;

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

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatStream', () => ({
  useChatStream: (...args) => mockUseChatStream(...args),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient', () => ({
  DesktopTranscriptSessionInfoRuntimeClient: {
    useDesktopTranscriptSessionInfo: () => mockUseTranscriptSessionInfo(),
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatSessionBootstrap', () => ({
  useChatSessionBootstrap: () => mockBootstrapSession,
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
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

});
