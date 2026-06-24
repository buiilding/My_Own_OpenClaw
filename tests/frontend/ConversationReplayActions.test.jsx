/**
 * Covers conversation replay actions. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useConversationReplayActions } from '../../frontend/src/renderer/features/chat/hooks/useConversationReplayActions';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/channels';
import { DesktopConversationContinuityService } from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
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
    editAndResend: jest.fn(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    })),
    retryTurn: jest.fn(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    })),
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

const mockLoadDisplayTimeline = DesktopConversationContinuityService.loadDisplayTimeline;
const mockReplaceRows = DesktopConversationContinuityService.replaceRows;
const mockEditAndResend = DesktopConversationContinuityService.editAndResend;
const mockRetryTurn = DesktopConversationContinuityService.retryTurn;
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
    mockEditAndResend.mockImplementation(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    }));
    mockRetryTurn.mockImplementation(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    }));
    useChatStore.setState({ activeConversationRef: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('routes retry through the SDK retry command', async () => {
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
    expect(mockReplaceRows).not.toHaveBeenCalled();
    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'assistant-1',
      turnRef: expect.any(String),
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    }));
    expect(mockRetryTurn).toHaveBeenCalledTimes(1);
  });

  test('retry replay publishes pending turn before the SDK command resolves', async () => {
    let resolveRetry;
    mockRetryTurn.mockImplementation((input) => new Promise((resolve) => {
      resolveRetry = () => resolve({
        turnRef: input.turnRef,
        queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
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

    expect(useChatStore.getState().pendingTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv-existing',
      turnRef: 'turn-replay-pending',
      userMessageId: 'turn-replay-pending-sdk-evt-000002-user_message',
      text: 'first question',
    }));
    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-replay-pending',
    }));

    await act(async () => {
      resolveRetry();
      await replayPromise;
    });

    expect(IpcBridge.send).toHaveBeenCalledWith(expect.any(String), {
      type: 'pending',
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-replay-pending',
        userMessageId: 'turn-replay-pending-sdk-evt-000002-user_message',
      }),
    });
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

    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'assistant-inline',
      payload: expect.not.objectContaining({
        screenshot: expect.any(String),
      }),
    }));
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

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'renderer-user-2',
      text: 'edited second question',
      turnRef: expect.any(String),
    }));
  });

  test('edit replay clears the stale assistant suffix before publishing the edited pending turn', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-edited-user');
    const screenshotAttachment = {
      id: 'shot-ready',
      kind: 'image',
      source: 'user_included',
      status: 'ready',
      screenshotRef: 'artifact-shot-ready',
    };
    const messages = [
      {
        id: 'renderer-user-1',
        sender: 'user',
        text: 'first question',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
        attachments: [screenshotAttachment],
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
        sourceEventType: 'assistant_message',
        sourceChannel: 'sdk:display-rows',
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
      await result.current.handleEditFromUser('renderer-user-1', 'edited first question');
    });

    expect(mockReplaceRows).not.toHaveBeenCalled();
    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'renderer-user-1',
      text: 'edited first question',
      turnRef: 'turn-edited-user',
      payload: expect.objectContaining({
        screenshot_refs: ['artifact-shot-ready'],
      }),
    }));
    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual([
      expect.objectContaining({
        id: 'turn-edited-user-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'edited first question',
        turnRef: 'turn-edited-user',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        attachments: [screenshotAttachment],
      }),
    ]);
    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: 'assistant-1' }),
      ]),
    );
    expect(mockRetryTurn).not.toHaveBeenCalled();
  });

  test('edit replay supersedes an active renderer-local user turn before sdk display rows exist', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-edited-active');
    const messages = [
      {
        id: 'turn-active-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'first question',
        turnRef: 'turn-active',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      },
    ];
    mockDisplayTimelineRows = [];
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
      await result.current.handleEditFromUser(
        'turn-active-sdk-evt-000002-user_message',
        'edited first question',
      );
    });

    expect(mockReplaceRows).not.toHaveBeenCalled();
    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'turn-active-sdk-evt-000002-user_message',
      text: 'edited first question',
      turnRef: 'turn-edited-active',
    }));
    expect(useChatStore.getState().getWorkspaceState('conv-existing')).toEqual(expect.objectContaining({
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-edited-active',
      }),
      supersededTurnRefs: {
        'turn-active': true,
      },
    }));
    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual([
      expect.objectContaining({
        id: 'turn-edited-active-sdk-evt-000002-user_message',
        text: 'edited first question',
        turnRef: 'turn-edited-active',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    ]);
  });

  test('edit replay preserves display-row image attachments when renderer message lacks them', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-display-attachments');
    const displayAttachment = {
      id: 'artifact-display-one',
      kind: 'image',
      source: 'user_included',
      status: 'ready',
      filename: 'display-one.png',
    };
    const messages = [
      {
        id: 'renderer-user-1',
        sender: 'user',
        text: 'first question',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
        sourceEventType: 'assistant_message',
        sourceChannel: 'sdk:display-rows',
      },
    ];
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    mockDisplayTimelineRows[0].metadata.attachments = [displayAttachment];
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
      await result.current.handleEditFromUser('renderer-user-1', 'edited first question');
    });

    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual([
      expect.objectContaining({
        id: 'turn-display-attachments-sdk-evt-000002-user_message',
        text: 'edited first question',
        attachments: [displayAttachment],
      }),
    ]);
    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        screenshot_refs: ['artifact-display-one'],
        attachment_filenames: ['display-one.png'],
      }),
    }));
  });

  test('edit replay sends legacy display-row screenshot refs through SDK replay payload', async () => {
    const messages = [
      {
        id: 'renderer-user-legacy',
        sender: 'user',
        text: 'question with legacy screenshot refs',
      },
      {
        id: 'assistant-legacy',
        sender: 'assistant',
        text: 'answer',
      },
    ];
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    mockDisplayTimelineRows[0].metadata.screenshot_refs = ['artifact-legacy-one', 'artifact-legacy-two'];

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-legacy', 'edited legacy question');
    });

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        screenshot_refs: ['artifact-legacy-one', 'artifact-legacy-two'],
      }),
    }));
  });

  test('edit replay publishes the retained prefix and edited pending turn atomically', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-atomic-edit');
    const messages = [
      {
        id: 'renderer-user-1',
        sender: 'user',
        text: 'first question',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
        sourceEventType: 'assistant_message',
        sourceChannel: 'sdk:display-rows',
      },
    ];
    mockDisplayTimelineRows = timelineRowsFromMessages(messages);
    useChatStore.getState().setActiveConversationRef('conv-existing');
    useChatStore.getState().clearMessages('conv-existing');
    useChatStore.getState().setMessages(messages, 'conv-existing');
    const visibleFrames = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      visibleFrames.push(
        state.getWorkspaceState('conv-existing').messages.map((message) => ({
          id: message.id,
          sender: message.sender,
          text: message.text,
          sourceEventType: message.sourceEventType,
          sourceChannel: message.sourceChannel,
          turnRef: message.turnRef,
        })),
      );
    });

    const { result } = renderHook(() => useConversationReplayActions({
      messages,
      setMessages: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
    }));

    try {
      await act(async () => {
        await result.current.handleEditFromUser('renderer-user-1', 'edited first question');
      });
    } finally {
      unsubscribe();
    }

    expect(visibleFrames).toHaveLength(1);
    expect(visibleFrames[0]).toEqual([
      expect.objectContaining({
        id: 'turn-atomic-edit-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'edited first question',
        turnRef: 'turn-atomic-edit',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    ]);
    expect(visibleFrames).toEqual(
      expect.not.arrayContaining([
        [],
        [expect.objectContaining({ id: 'assistant-1' })],
      ]),
    );
  });

  test('edit replay can prepare again from the persisted replacement user row', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('turn-overlap-one')
      .mockReturnValueOnce('turn-overlap-two');
    let childRevisionIndex = 0;
    let currentRevisionId = 'rev-base';
    mockLoadDisplayTimeline.mockImplementation(async (userId, conversationRef) => ({
      conversationRef,
      revisionId: currentRevisionId,
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: mockDisplayTimelineRows,
    }));
    mockEditAndResend.mockImplementation(async (input) => {
      childRevisionIndex += 1;
      const revisionId = `rev-child-${childRevisionIndex}`;
      currentRevisionId = revisionId;
      const rows = [
        {
          id: `${input.turnRef}-sdk-evt-000002-user_message`,
          conversationRef: input.conversationRef,
          revisionId,
          index: 0,
          role: 'user',
          type: 'user_message',
          turnRef: input.turnRef,
          content: input.text,
          metadata: {
            replacedDisplayRowId: input.messageId,
            revisionId,
            sourceEventType: 'renderer-compose',
          },
        },
      ];
      mockDisplayTimelineRows = rows;
      return {
        turnRef: input.turnRef,
        queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
      };
    });
    mockRetryTurn.mockImplementation(async (input) => {
      childRevisionIndex += 1;
      const revisionId = `rev-child-${childRevisionIndex}`;
      currentRevisionId = revisionId;
      mockDisplayTimelineRows = mockDisplayTimelineRows.map((row, index) => ({
        ...row,
        revisionId,
        metadata: {
          ...(row.metadata ?? {}),
          revisionId,
        },
      }));
      return {
        turnRef: input.turnRef,
        queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
      };
    });
    const messages = [
      {
        id: 'renderer-user-1',
        sender: 'user',
        text: 'first question',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'first answer',
        sourceEventType: 'assistant_message',
        sourceChannel: 'sdk:display-rows',
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
      await result.current.handleEditFromUser('renderer-user-1', 'edited first question');
      await result.current.handleEditFromUser('renderer-user-1', 'edited first question');
    });

    expect(mockEditAndResend).toHaveBeenCalledTimes(2);
    expect(mockEditAndResend.mock.calls[0][0]).toEqual(expect.objectContaining({
      messageId: 'renderer-user-1',
      turnRef: 'turn-overlap-one',
    }));
    expect(mockEditAndResend.mock.calls[1][0]).toEqual(expect.objectContaining({
      messageId: 'renderer-user-1',
      turnRef: 'turn-overlap-two',
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

    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'assistant-url',
      payload: expect.objectContaining({
        screenshot_ref: 'artifact-99',
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-99',
      }),
    }));
  });

  test('retry replay sends display timeline multi-image refs and attachment filenames through SDK', async () => {
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

    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        screenshot_refs: ['artifact-1', 'artifact-2'],
        attachment_filenames: ['one.png', 'two.png'],
      }),
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
    expect(mockRetryTurn.mock.calls[0][0].conversationRef).toBe('conv_replay-ref');
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
    expect(mockRetryTurn.mock.calls[0][0].conversationRef).toBe('conv-store-active');
  });

  test('retry replay reverts pending messages when the SDK retry command rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRetryTurn.mockRejectedValue(new Error('retry rejected'));
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

    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual([
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        text: expect.stringContaining("Your message wasn't sent"),
      }),
    ]);
    errorSpy.mockRestore();
  });

  test('retry replay appends a preparation error when display timeline load rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoadDisplayTimeline.mockRejectedValue(new Error('display load rejected'));
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

  test('retry replay appends the send failure error when SDK retry rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRetryTurn.mockRejectedValue(new Error('send rejected'));
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
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'renderer-replay',
        text: expect.stringContaining("Your message wasn't sent"),
      }),
    ]);
    expect(useChatStore.getState().messages).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: 'assistant-1' }),
      ]),
    );
    errorSpy.mockRestore();
  });
});
