import React from 'react';
import { render, waitFor } from '@testing-library/react';

import {
  DEFAULT_CHAT_WORKSPACE_REF,
  createInitialStreamTracking,
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { ChatProvider } from '../../frontend/src/renderer/app/providers/ChatProvider';

const mockUseChatStream = jest.fn();
const mockUseToolRunner = jest.fn();
const mockUseTranscriptSessionInfo = jest.fn();

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatStream', () => ({
  useChatStream: (...args) => mockUseChatStream(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useToolRunner', () => ({
  useToolRunner: (...args) => mockUseToolRunner(...args),
}));

jest.mock('../../frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo', () => ({
  useTranscriptSessionInfo: () => mockUseTranscriptSessionInfo(),
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

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationRef).toBe('conv-overlay-1');
    });
  });

  test('clears active conversation when transcript session conversation ref is null', async () => {
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
      expect(useChatStore.getState().activeConversationRef).toBeNull();
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
});
