import { act, renderHook } from '@testing-library/react';

import { useConversationReplayActions } from '../../frontend/src/renderer/features/chat/hooks/useConversationReplayActions';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

let mockFrontendConfig = {
  model_provider: 'anthropic',
  selected_model_id: 'claude-sonnet-4-5',
};

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockFrontendConfig,
  })),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendRehydrateConversation: jest.fn(),
    updateSettings: jest.fn(),
    sendQuery: jest.fn(),
  },
}));

let mockConversationRef = 'conv-existing';
jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getActiveConversationRef: jest.fn(() => mockConversationRef),
  getTranscriptSessionInfo: jest.fn(() => ({
    conversationRef: mockConversationRef,
    userId: 'user-1',
  })),
  setActiveConversationRef: jest.fn((nextRef) => {
    mockConversationRef = nextRef;
  }),
  updateTranscriptSession: jest.fn(),
}));

const mockSendRehydrateConversation = ApiClient.sendRehydrateConversation;
const mockUpdateSettings = ApiClient.updateSettings;
const mockSendQuery = ApiClient.sendQuery;
const mockGetActiveConversationRef = getActiveConversationRef;
const mockGetTranscriptSessionInfo = getTranscriptSessionInfo;
const mockSetActiveConversationRef = setActiveConversationRef;
const mockUpdateTranscriptSession = updateTranscriptSession;

describe('useConversationReplayActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrontendConfig = {
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    };
    mockConversationRef = 'conv-existing';
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.DELETE_CONVERSATION) {
        return { success: true };
      }
      if (channel === INVOKE_CHANNELS.STORE_TRANSCRIPT) {
        return { success: true };
      }
      return null;
    });
    mockSendRehydrateConversation.mockResolvedValue(undefined);
    mockSendQuery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('syncs selected model to backend before retrying assistant turn', async () => {
    const messages = [
      {
        id: 'user-1',
        sender: 'user',
        text: 'first question',
        screenshotRef: null,
        screenshotUrl: null,
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
      },
    ];
    const setMessages = jest.fn();
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const setIsSending = jest.fn();

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(mockGetActiveConversationRef).toHaveBeenCalled();
    expect(mockGetTranscriptSessionInfo).toHaveBeenCalled();
    expect(mockSetActiveConversationRef).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-existing', 'user-1');
    expect((IpcBridge.invoke).mock.calls).toContainEqual([
      INVOKE_CHANNELS.DELETE_CONVERSATION,
      {
        userId: 'user-1',
        conversationId: 'conv-existing',
        recordKind: 'transcript',
      },
    ]);
    expect(mockSendRehydrateConversation).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    });
    expect(mockUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendQuery.mock.invocationCallOrder[0],
    );
    expect(mockSendQuery).toHaveBeenCalledWith(
      'first question',
      'conv-existing',
      null,
      null,
    );
  });
});
