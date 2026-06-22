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
let mockDisplayTimelineRows = [];

function timelineRowsFromMessages(messages, conversationRef = 'conv-existing', revisionId = 'rev-base') {
  return messages.map((message, index) => ({
    id: message.id,
    conversationRef,
    revisionId,
    index,
    role: message.sender === 'user' ? 'user' : 'assistant',
    type: message.sender === 'user' ? 'user_message' : 'assistant_message',
    content: message.text,
    metadata: {
      revisionId,
      ...(Array.isArray(message.attachments) ? { attachments: message.attachments } : {}),
    },
  }));
}

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    loadDisplayTimeline: jest.fn(async (userId, conversationRef) => ({
      conversationRef,
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: mockDisplayTimelineRows,
    })),
    replaceRows: jest.fn(async (input) => ({
      conversationRef: input.conversationRef,
      revisionId: 'rev-child',
      createdAt: '2026-06-22T12:01:00.000Z',
      reason: input.reason,
      baseRevisionId: input.baseRevisionId,
      rows: input.rows,
    })),
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
const mockLoadDisplayTimeline = DesktopConversationContinuityService.loadDisplayTimeline;
const mockReplaceRows = DesktopConversationContinuityService.replaceRows;
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
    mockDisplayTimelineRows = [];
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION) {
        return { success: true };
      }
      return null;
    });
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
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
    mockLoadDisplayTimeline.mockImplementation(async (userId, conversationRef) => ({
      conversationRef,
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: mockDisplayTimelineRows,
    }));
    mockReplaceRows.mockImplementation(async (input) => ({
      conversationRef: input.conversationRef,
      revisionId: 'rev-child',
      createdAt: '2026-06-22T12:01:00.000Z',
      reason: input.reason,
      baseRevisionId: input.baseRevisionId,
      rows: input.rows,
    }));
    mockSendQuery.mockResolvedValue(undefined);
    useChatStore.setState({ activeConversationRef: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('replaces display rows for retry and dispatches through live-turn send', async () => {
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    const setMessages = jest.fn();
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(mockGetActiveConversationRef).toHaveBeenCalled();
    expect(mockGetTranscriptSessionInfo).toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-existing', 'user-1');
    expect(mockLoadDisplayTimeline).toHaveBeenCalledWith('user-1', 'conv-existing');
    expect(mockReplaceRows).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      baseRevisionId: 'rev-base',
      reason: 'retry',
      rows: [],
    }));
    expect(mockPrepareRetryTurn).not.toHaveBeenCalled();
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

  test('retry replay waits for display replacement before publishing pending turn', async () => {
    let resolveReplacement;
    mockReplaceRows.mockImplementation((input) => new Promise((resolve) => {
      resolveReplacement = () => resolve({
        conversationRef: input.conversationRef,
        revisionId: 'rev-child',
        createdAt: '2026-06-22T12:01:00.000Z',
        reason: input.reason,
        baseRevisionId: input.baseRevisionId,
        rows: input.rows,
      });
    }));
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-replay-pending');
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: useChatStore.getState().setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    let replayPromise;
    await act(async () => {
      replayPromise = result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(useChatStore.getState().pendingTurn).toBeNull();
    expect(mockSendQuery).not.toHaveBeenCalled();

    await act(async () => {
      resolveReplacement();
      await replayPromise;
    });

    expect(useChatStore.getState().pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-existing',
      turnRef: 'turn-replay-pending',
      userMessageId: 'user-1',
      text: 'first question',
    }));
    expect(IpcBridge.send).toHaveBeenCalledWith(expect.any(String), {
      type: 'pending',
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-replay-pending',
        userMessageId: 'user-1',
      }),
    });
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-replay-pending',
    }));
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages, 'conv_replay-ref');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-inline');
    });

    expect(mockReplaceRows).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'retry',
      rows: [],
    }));
    expect(mockPrepareRetryTurn).not.toHaveBeenCalled();
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-2', 'edited second question');
    });

    expect(mockReplaceRows).toHaveBeenCalledWith(expect.objectContaining({
      baseRevisionId: 'rev-base',
      reason: 'user_edit',
      rows: [
        expect.objectContaining({ id: 'renderer-user-1' }),
        expect.objectContaining({ id: 'assistant-1' }),
      ],
    }));
    expect(mockPrepareEditAndResend).not.toHaveBeenCalled();
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-url');
    });

    expect(mockReplaceRows).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'retry',
      rows: [],
    }));
    expect(mockPrepareRetryTurn).not.toHaveBeenCalled();
    expect(mockSendQuery).toHaveBeenCalledWith(expect.objectContaining({
      screenshotRef: 'artifact-99',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-99',
    }));
  });

  test('retry replay dispatches display timeline multi-image refs and attachment filenames', async () => {
    const messages = [
      {
        id: 'user-multi-image',
        sender: 'user',
        text: 'question with two images',
        attachments: [
          {
            id: 'artifact-1',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            filename: 'one.png',
          },
          {
            id: 'artifact-2',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            filename: 'two.png',
          },
        ],
      },
      {
        id: 'assistant-multi-image',
        sender: 'assistant',
        text: 'answer',
      },
    ];
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-multi-image');
    });

    expect(mockPrepareRetryTurn).not.toHaveBeenCalled();
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages, 'conv_replay-ref');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-new');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_replay-ref', undefined);
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_replay-ref', 'user-1');
    expect(mockReplaceRows.mock.calls[0][0].conversationRef).toBe('conv_replay-ref');
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages, 'conv-store-active');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-store');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-store-active', 'user-1');
    expect(mockReplaceRows.mock.calls[0][0].conversationRef).toBe('conv-store-active');
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv-store-active');
  });

  test('retry replay does not pre-mutate messages when display replacement rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockReplaceRows.mockRejectedValue(new Error('retry rejected'));
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    const setMessages = jest.fn();

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(setMessages).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('retry replay appends a preparation error when continuity service rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockReplaceRows.mockRejectedValue(new Error('retry rejected'));
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: useChatStore.getState().setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
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
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: useChatStore.getState().setMessages,
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
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
