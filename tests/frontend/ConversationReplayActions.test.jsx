import { act, renderHook } from '@testing-library/react';

import { useConversationReplayActions } from '../../frontend/src/renderer/features/chat/hooks/useConversationReplayActions';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  markConversationInferenceSessionLocalOnly,
  rehydrateConversationInferenceSession,
} from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

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
    updateSettings: jest.fn(),
    sendQuery: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  markConversationInferenceSessionLocalOnly: jest.fn(),
  rehydrateConversationInferenceSession: jest.fn(),
}));

let mockConversationRef = 'conv-existing';
jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getActiveConversationRef: jest.fn(() => mockConversationRef),
  getTranscriptSessionInfo: jest.fn(() => ({
    conversationRef: mockConversationRef,
    userId: 'user-1',
  })),
  updateTranscriptSession: jest.fn(),
}));

const mockUpdateSettings = ApiClient.updateSettings;
const mockSendQuery = ApiClient.sendQuery;
const mockGetActiveConversationRef = getActiveConversationRef;
const mockGetTranscriptSessionInfo = getTranscriptSessionInfo;
const mockUpdateTranscriptSession = updateTranscriptSession;
const mockMarkConversationInferenceSessionLocalOnly = markConversationInferenceSessionLocalOnly;
const mockRehydrateConversationInferenceSession = rehydrateConversationInferenceSession;

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
    mockMarkConversationInferenceSessionLocalOnly.mockReset();
    mockRehydrateConversationInferenceSession.mockReset();
    mockRehydrateConversationInferenceSession.mockResolvedValue(undefined);
    mockSendQuery.mockResolvedValue(undefined);
    useChatStore.setState({ activeConversationRef: null });
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
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-existing', 'user-1');
    expect((IpcBridge.invoke).mock.calls).toContainEqual([
      INVOKE_CHANNELS.DELETE_CONVERSATION,
      {
        userId: 'user-1',
        conversationId: 'conv-existing',
        recordKind: 'transcript',
      },
    ]);
    expect((IpcBridge.invoke).mock.calls).toContainEqual([
      INVOKE_CHANNELS.DELETE_CONVERSATION,
      {
        userId: 'user-1',
        conversationId: 'conv-existing',
        recordKind: 'transcript_replay',
      },
    ]);
    expect(mockRehydrateConversationInferenceSession).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    });
    expect(mockUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendQuery.mock.invocationCallOrder[0],
    );
    expect(mockSendQuery.mock.calls.some(([
      queryText,
      conversationRef,
      screenshotRef,
      screenshotUrl,
      screenshotRefs,
      videoRef,
      filePaths,
      fileRefs,
      inlineScreenshot,
    ]) => (
      queryText === 'first question'
      && conversationRef === 'conv-existing'
      && (screenshotRef ?? null) === null
      && (screenshotUrl ?? null) === null
      && (screenshotRefs ?? null) === null
      && (videoRef ?? null) === null
      && (filePaths ?? null) === null
      && (fileRefs ?? null) === null
      && (inlineScreenshot ?? null) === null
    ))).toBe(true);
  });

  test('retry replay preserves inline screenshots in transcript rewrite and query send', async () => {
    const inlineScreenshot = 'A'.repeat(256);
    const messages = [
      {
        id: 'user-inline',
        sender: 'user',
        text: 'question with inline screenshot',
        screenshot: inlineScreenshot,
        screenshotRef: null,
        screenshotUrl: null,
      },
      {
        id: 'assistant-inline',
        sender: 'assistant',
        text: 'answer',
      },
    ];

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-inline');
    });

    expect((IpcBridge.invoke)).toHaveBeenCalledWith(
      INVOKE_CHANNELS.STORE_TRANSCRIPT,
      expect.objectContaining({
        content: 'question with inline screenshot',
        screenshot: inlineScreenshot,
      }),
    );
    expect(mockSendQuery.mock.calls.some(([
      queryText,
      conversationRef,
      screenshotRef,
      screenshotUrl,
      screenshotRefs,
      videoRef,
      filePaths,
      fileRefs,
      inlineShot,
    ]) => (
      queryText === 'question with inline screenshot'
      && conversationRef === 'conv-existing'
      && (screenshotRef ?? null) === null
      && (screenshotUrl ?? null) === null
      && (screenshotRefs ?? null) === null
      && (videoRef ?? null) === null
      && (filePaths ?? null) === null
      && (fileRefs ?? null) === null
      && inlineShot === inlineScreenshot
    ))).toBe(true);
  });

  test('retry replay infers artifact refs from screenshot urls', async () => {
    const messages = [
      {
        id: 'user-url',
        sender: 'user',
        text: 'question with url screenshot',
        screenshotRef: null,
        screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-99',
      },
      {
        id: 'assistant-url',
        sender: 'assistant',
        text: 'answer',
      },
    ];

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-url');
    });

    expect((IpcBridge.invoke)).toHaveBeenCalledWith(
      INVOKE_CHANNELS.STORE_TRANSCRIPT,
      expect.objectContaining({
        content: 'question with url screenshot',
        screenshot: 'artifact-99',
      }),
    );
    expect(mockSendQuery.mock.calls.some(([
      queryText,
      conversationRef,
      screenshotRef,
      screenshotUrl,
      screenshotRefs,
      videoRef,
      filePaths,
      fileRefs,
      inlineShot,
    ]) => (
      queryText === 'question with url screenshot'
      && conversationRef === 'conv-existing'
      && screenshotRef === 'artifact-99'
      && screenshotUrl === 'http://127.0.0.1:8765/api/artifacts/artifact-99'
      && (screenshotRefs ?? null) === null
      && (videoRef ?? null) === null
      && (filePaths ?? null) === null
      && (fileRefs ?? null) === null
      && (inlineShot ?? null) === null
    ))).toBe(true);
  });

  test('retry replay creates and selects a fresh local conversation when no active session exists', async () => {
    mockConversationRef = null;
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('replay-ref');

    const messages = [
      {
        id: 'user-new',
        sender: 'user',
        text: 'brand new question',
        screenshotRef: null,
        screenshotUrl: null,
      },
      {
        id: 'assistant-new',
        sender: 'assistant',
        text: 'brand new answer',
      },
    ];

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-new');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_replay-ref', undefined);
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_replay-ref', 'user-1');
    expect(mockMarkConversationInferenceSessionLocalOnly).toHaveBeenCalledWith('conv_replay-ref');
    expect(mockSendQuery.mock.calls[0][1]).toBe('conv_replay-ref');
  });

  test('retry replay reuses projected chat-store conversation ref when transcript session is empty', async () => {
    mockConversationRef = null;
    useChatStore.setState({ activeConversationRef: 'conv-store-active' });

    const messages = [
      {
        id: 'user-store',
        sender: 'user',
        text: 'question from projected chat',
        screenshotRef: null,
        screenshotUrl: null,
      },
      {
        id: 'assistant-store',
        sender: 'assistant',
        text: 'answer',
      },
    ];

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-store');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-store-active', 'user-1');
    expect(mockMarkConversationInferenceSessionLocalOnly).not.toHaveBeenCalled();
    expect(mockSendQuery.mock.calls[0][1]).toBe('conv-store-active');
  });
});
