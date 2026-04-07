import React from 'react';
import { render, waitFor } from '@testing-library/react';

import {
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { ChatProvider } from '../../frontend/src/renderer/app/providers/ChatProvider';

const mockUseChatStream = jest.fn();
const mockUseToolRunner = jest.fn();
const mockUseTranscriptSessionInfo = jest.fn();
const mockBootstrapSession = jest.fn().mockResolvedValue({ conversationRef: null, userId: null });
const mockInvalidateConversationInferenceSessionState = jest.fn();
const mockIpcOn = jest.fn(() => jest.fn());
const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

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

jest.mock('../../frontend/src/renderer/features/chat/hooks/useToolRunner', () => ({
  useToolRunner: (...args) => mockUseToolRunner(...args),
}));

jest.mock('../../frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo', () => ({
  useTranscriptSessionInfo: () => mockUseTranscriptSessionInfo(),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatSessionBootstrap', () => ({
  useChatSessionBootstrap: () => mockBootstrapSession,
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  invalidateConversationInferenceSessionState: () => mockInvalidateConversationInferenceSessionState(),
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
    turnConversationRefs: {},
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
    mockUseToolRunner.mockReset();
    mockUseTranscriptSessionInfo.mockReset();
    mockBootstrapSession.mockClear();
    mockInvalidateConversationInferenceSessionState.mockReset();
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
      <ChatProvider enableToolRunner={false} enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    expect(mockUseChatStream).toHaveBeenCalledWith(false);
    expect(mockUseToolRunner).toHaveBeenCalledWith(false);
    expect(mockBootstrapSession).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-overlay-1');
    });
  });

  test('does not clear active conversation when transcript session conversation ref is null', async () => {
    useChatStore.getState().setActiveConversationRef('conv-previous');
    mockUseTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'peter',
    });

    render(
      <ChatProvider enableToolRunner={false} enableTranscript={false}>
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
      <ChatProvider enableToolRunner={false} enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-a');
    });

    session.conversationRef = 'conv-b';
    rerender(
      <ChatProvider enableToolRunner={false} enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-b');
    });
  });

  test('invalidates lazy backend sync state when transport disconnects', async () => {
    mockUseTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'peter',
    });

    render(
      <ChatProvider enableToolRunner={false} enableTranscript={false}>
        <div>overlay</div>
      </ChatProvider>,
    );

    expect(mockIpcOn).toHaveBeenCalledWith('ipc-status', expect.any(Function));
    const disconnectListener = mockIpcOn.mock.calls.find(([channel]) => channel === 'ipc-status')?.[1];
    disconnectListener?.({ isConnected: false });

    expect(mockInvalidateConversationInferenceSessionState).toHaveBeenCalledTimes(1);
  });
});
