/**
 * Covers SDK-command conversation replay actions in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { useConversationReplayActions } from '../../src/renderer/features/chat/hooks/useConversationReplayActions';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  clearMessagesInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  getWorkspaceStateFromChatStoreForTest as getWorkspaceStateFromChatStore,
} from './chatStoreTestUtils';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { DesktopConversationContinuityService } from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

let mockConversationRef = 'conv-existing';

function getActiveWorkspace() {
  return getWorkspaceStateFromChatStore();
}

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    editAndResend: jest.fn(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    })),
    retryTurn: jest.fn(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    })),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockConversationRef),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: mockConversationRef,
      userId: 'user-1',
    })),
    updateTranscriptSession: jest.fn(),
  },
}));

const mockEditAndResend = DesktopConversationContinuityService.editAndResend;
const mockRetryTurn = DesktopConversationContinuityService.retryTurn;
const mockGetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef;
const mockGetTranscriptSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo;
const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession;

describe('useConversationReplayActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversationRef = 'conv-existing';
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION) {
        return { success: true };
      }
      return null;
    });
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    mockEditAndResend.mockImplementation(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    }));
    mockRetryTurn.mockImplementation(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    }));
    useChatStore.setState({ activeConversationRef: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('routes retry row-target intent through the SDK retry command', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(mockGetActiveConversationRef).toHaveBeenCalled();
    expect(mockGetTranscriptSessionInfo).toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-existing', 'user-1');
    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'assistant-1',
    }));
    expect(mockRetryTurn.mock.calls[0][0]).not.toHaveProperty('model');
    expect(mockRetryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(mockRetryTurn).toHaveBeenCalledTimes(1);
    expect(getWorkspaceStateFromChatStore('conv-existing').pendingTurn).toBeNull();
  });

  test('routes edit row-target intent through the SDK edit-and-resend command', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-2', ' edited second question ');
    });

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'renderer-user-2',
      text: ' edited second question ',
    }));
    expect(mockEditAndResend.mock.calls[0][0]).not.toHaveProperty('model');
    expect(mockEditAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(getWorkspaceStateFromChatStore('conv-existing').pendingTurn).toBeNull();
  });

  test('leaves replay attachments and target-row resources to SDK resolution', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-with-attachments');
    });

    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'assistant-with-attachments',
    }));
    expect(mockRetryTurn.mock.calls[0][0]).not.toHaveProperty('payload');
    expect(getWorkspaceStateFromChatStore('conv-existing').messages).toEqual([]);
  });

  test('does not add renderer workspace payload to replay commands', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-1', 'edited question');
    });

    expect(mockEditAndResend.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  test('does not create a conversation when no replay scope exists', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockConversationRef = null;
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-new');
    });

    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(mockEditAndResend).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('does not use chat-store active conversation when transcript session is empty', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockConversationRef = null;
    useChatStore.setState({ activeConversationRef: 'conv-store-active' });
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-store');
    });

    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(mockEditAndResend).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('uses exact SDK row conversation scope when transcript session is empty', async () => {
    mockConversationRef = null;
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-row', 'conv-row-scope');
      await result.current.handleEditFromUser('user-row', 'edited question', 'conv-row-scope');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-row-scope', 'user-1');
    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-row-scope',
      userId: 'user-1',
      messageId: 'assistant-row',
    }));
    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-row-scope',
      userId: 'user-1',
      messageId: 'user-row',
      text: 'edited question',
    }));
  });

  test('passes blank edit text through to SDK replay command', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-blank', '   ');
    });

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'renderer-user-blank',
      text: '   ',
    }));
    expect(mockRetryTurn).not.toHaveBeenCalled();
  });

  test('rejects empty replay row targets before the SDK command facade', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant(' ');
      await result.current.handleEditFromUser(' ', 'edited question');
    });

    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(mockEditAndResend).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('rejects padded replay row targets before the SDK command facade', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant(' assistant-1 ');
      await result.current.handleEditFromUser(' renderer-user-1 ', 'edited question');
    });

    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(mockEditAndResend).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('does not append a renderer replay error row when SDK retry rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRetryTurn.mockRejectedValue(new Error('send rejected'));
    useChatStore.getState().setActiveConversationRef('conv-existing');
    clearMessagesInChatStore('conv-existing');
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-1');
    });

    expect(getActiveWorkspace().messages).toEqual([]);
    errorSpy.mockRestore();
  });
});
