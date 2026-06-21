/**
 * Covers conversation replay actions. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useConversationReplayActions } from '../../frontend/src/renderer/features/chat/hooks/useConversationReplayActions';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/channels';
import { DesktopConversationContinuityService } from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopLiveTurnRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

let mockRendererConfig = {
  model_provider: 'anthropic',
  selected_model_id: 'claude-sonnet-4-5',
};

jest.mock('../../frontend/src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockRendererConfig,
  })),
}));

let mockConversationRef = 'conv-existing';
jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    prepareEditAndResend: jest.fn(async (input) => ({
      conversationRef: input.conversationRef,
      text: input.text,
      payload: input.payload,
      model: input.model,
      workspacePath: input.workspacePath,
      turnRef: null,
    })),
    prepareRetryTurn: jest.fn(async (input) => ({
      conversationRef: input.conversationRef,
      text: input.text,
      payload: input.payload,
      model: input.model,
      workspacePath: input.workspacePath,
      turnRef: null,
    })),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    sendQuery: jest.fn(async () => undefined),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockConversationRef),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: mockConversationRef,
      userId: 'user-1',
    })),
    updateTranscriptSession: jest.fn(),
  },
}));

const mockPrepareEditAndResend = DesktopConversationContinuityService.prepareEditAndResend;
const mockPrepareRetryTurn = DesktopConversationContinuityService.prepareRetryTurn;
const mockSendQuery = DesktopLiveTurnRuntimeClient.sendQuery;
const mockGetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef;
const mockGetTranscriptSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo;
const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession;

describe('useConversationReplayActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRendererConfig = {
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    };
    mockConversationRef = 'conv-existing';
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION) {
        return { success: true };
      }
      return null;
    });
    mockPrepareEditAndResend.mockImplementation(async (input) => ({
      conversationRef: input.conversationRef,
      text: input.text,
      payload: input.payload,
      model: input.model,
      workspacePath: input.workspacePath,
      turnRef: null,
    }));
    mockPrepareRetryTurn.mockImplementation(async (input) => ({
      conversationRef: input.conversationRef,
      text: input.text,
      payload: input.payload,
      model: input.model,
      workspacePath: input.workspacePath,
      turnRef: null,
    }));
    mockSendQuery.mockResolvedValue(undefined);
    useChatStore.setState({ activeConversationRef: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('prepares retry through continuity and dispatches through live-turn send', async () => {
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
    expect(mockPrepareRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'assistant-1',
      text: 'first question',
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    }));
    expect(mockPrepareRetryTurn.mock.calls[0][0]).not.toHaveProperty('projectionEntries');
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      text: 'first question',
      turnRef: expect.any(String),
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    }));
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockPrepareEditAndResend).not.toHaveBeenCalled();
  });

  test('retry replay drops inline screenshots from query payloads', async () => {
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

    expect(mockPrepareRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      payload: {},
    }));
    expect(mockPrepareRetryTurn.mock.calls[0][0]).not.toHaveProperty('projectionEntries');
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('screenshot');
  });

  test('edit replay sends the selected user message id', async () => {
    const messages = [
      {
        id: 'renderer-user-1',
        sender: 'user',
        text: 'first question',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
      },
      {
        id: 'renderer-user-2',
        sender: 'user',
        text: 'second question',
      },
      {
        id: 'assistant-2',
        sender: 'assistant',
        text: 'second answer',
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
      await result.current.handleEditFromUser('renderer-user-2', 'edited second question');
    });

    expect(mockPrepareEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'renderer-user-2',
      text: 'edited second question',
    }));
    expect(mockPrepareEditAndResend.mock.calls[0][0]).not.toHaveProperty('userMessageOrdinal');
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: 'edited second question',
    }));
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

    expect(mockPrepareRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        screenshot_ref: 'artifact-99',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-99',
      },
    }));
    expect(mockPrepareRetryTurn.mock.calls[0][0]).not.toHaveProperty('projectionEntries');
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      screenshotRef: 'artifact-99',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-99',
    }));
  });

  test('retry replay dispatches prepared multi-image refs and attachment filenames', async () => {
    mockPrepareRetryTurn.mockImplementation(async (input) => ({
      conversationRef: input.conversationRef,
      text: input.text,
      payload: {
        ...input.payload,
        screenshot_refs: ['artifact-1', 'artifact-2'],
        attachment_filenames: ['one.png', 'two.png'],
      },
      model: input.model,
      workspacePath: input.workspacePath,
      turnRef: null,
    }));
    const messages = [
      {
        id: 'user-multi-image',
        sender: 'user',
        text: 'question with two images',
      },
      {
        id: 'assistant-multi-image',
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
      await result.current.handleTryAgainFromAssistant('assistant-multi-image');
    });

    expect(mockPrepareRetryTurn.mock.calls[0][0].payload).not.toHaveProperty('screenshot_refs');
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      screenshotRefs: ['artifact-1', 'artifact-2'],
      attachmentFilenames: ['one.png', 'two.png'],
    }));
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
    expect(mockPrepareRetryTurn.mock.calls[0][0].conversationRef).toBe('conv_replay-ref');
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv_replay-ref');
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
    expect(mockPrepareRetryTurn.mock.calls[0][0].conversationRef).toBe('conv-store-active');
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv-store-active');
  });

  test('retry replay restores original messages when preparation rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrepareRetryTurn.mockRejectedValue(new Error('retry rejected'));
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
      {
        id: 'user-2',
        sender: 'user',
        text: 'later question',
      },
    ];
    const setMessages = jest.fn();
    const setIsSending = jest.fn();

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending,
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(setMessages).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ id: 'user-1' })],
      'conv-existing',
    );
    expect(setMessages).toHaveBeenLastCalledWith(messages, 'conv-existing');
    expect(setIsSending).toHaveBeenLastCalledWith(false, 'conv-existing');
    errorSpy.mockRestore();
  });

  test('retry replay appends a preparation error when continuity service rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrepareRetryTurn.mockRejectedValue(new Error('retry rejected'));
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
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: useChatStore.getState().setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: useChatStore.getState().setIsSending,
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(useChatStore.getState().messages).toEqual([
      ...messages,
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'renderer-replay',
        text: expect.stringContaining('could not prepare the conversation replay'),
      }),
    ]);
    errorSpy.mockRestore();
  });

  test('retry replay appends the send failure error when live-turn dispatch rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSendQuery.mockRejectedValue(new Error('send rejected'));
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
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: useChatStore.getState().setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      setIsSending: useChatStore.getState().setIsSending,
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(useChatStore.getState().messages).toEqual([
      ...messages,
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'renderer-replay',
        text: expect.stringContaining("Your message wasn't sent"),
      }),
    ]);
    errorSpy.mockRestore();
  });
});
