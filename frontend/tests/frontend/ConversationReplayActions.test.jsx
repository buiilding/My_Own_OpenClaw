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
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { DesktopConversationContinuityService } from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopSettingsRuntimeClient } from '../../src/renderer/app/runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

let mockRendererConfig = {
  model_provider: 'anthropic',
  selected_model_id: 'claude-sonnet-4-5',
};

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockRendererConfig,
  })),
}));

let mockConversationRef = 'conv-existing';

function getActiveWorkspace() {
  return useChatStore.getState().getWorkspaceState();
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

jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(async () => undefined),
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

jest.mock('../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    getConversationWorkspaceBinding: jest.fn(() => ({ workspacePath: null })),
    setConversationWorkspaceBinding: jest.fn(),
  },
}));

const mockEditAndResend = DesktopConversationContinuityService.editAndResend;
const mockRetryTurn = DesktopConversationContinuityService.retryTurn;
const mockSetModel = DesktopSettingsRuntimeClient.setModel;
const mockGetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef;
const mockGetTranscriptSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo;
const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession;
const mockGetConversationWorkspaceBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding;

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
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    mockEditAndResend.mockImplementation(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    }));
    mockRetryTurn.mockImplementation(async (input) => ({
      turnRef: input.turnRef ?? 'sdk-replay-turn',
      queryMessageId: `${input.turnRef ?? 'sdk-replay-turn'}-sdk-evt-000002-user_message`,
    }));
    mockSetModel.mockResolvedValue(undefined);
    mockGetConversationWorkspaceBinding.mockReturnValue({ workspacePath: null });
    useChatStore.setState({ activeConversationRef: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('routes retry intent through the SDK retry command', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant(' assistant-1 ');
    });

    expect(mockGetActiveConversationRef).toHaveBeenCalled();
    expect(mockGetTranscriptSessionInfo).toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-existing', 'user-1');
    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'assistant-1',
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    }));
    expect(mockSetModel).toHaveBeenCalledWith({
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
    expect(mockSetModel.mock.invocationCallOrder[0]).toBeLessThan(
      mockRetryTurn.mock.invocationCallOrder[0],
    );
    expect(mockRetryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(mockRetryTurn).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().getWorkspaceState('conv-existing').pendingTurn).toBeNull();
  });

  test('routes edit intent through the SDK edit-and-resend command', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleEditFromUser(' renderer-user-2 ', ' edited second question ');
    });

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-existing',
      userId: 'user-1',
      messageId: 'renderer-user-2',
      text: 'edited second question',
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
    }));
    expect(mockSetModel).toHaveBeenCalledWith({
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
    expect(mockSetModel.mock.invocationCallOrder[0]).toBeLessThan(
      mockEditAndResend.mock.invocationCallOrder[0],
    );
    expect(mockEditAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(useChatStore.getState().getWorkspaceState('conv-existing').pendingTurn).toBeNull();
  });

  test('leaves replay attachments and target-row resources to SDK resolution', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-with-attachments');
    });

    expect(mockRetryTurn).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'assistant-with-attachments',
      payload: {},
    }));
    expect(mockRetryTurn.mock.calls[0][0].payload).not.toHaveProperty('screenshot_ref');
    expect(mockRetryTurn.mock.calls[0][0].payload).not.toHaveProperty('screenshot_refs');
    expect(mockRetryTurn.mock.calls[0][0].payload).not.toHaveProperty('attachment_filenames');
    expect(useChatStore.getState().getWorkspaceState('conv-existing').messages).toEqual([]);
  });

  test('adds workspace path payload only as renderer IPC context', async () => {
    mockGetConversationWorkspaceBinding.mockReturnValue({ workspacePath: '/tmp/workspace-a' });
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleEditFromUser('renderer-user-1', 'edited question');
    });

    expect(mockEditAndResend).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        workspace_path: '/tmp/workspace-a',
      },
    }));
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

  test('reuses projected chat-store conversation ref when transcript session is empty', async () => {
    mockConversationRef = null;
    useChatStore.setState({ activeConversationRef: 'conv-store-active' });
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant('assistant-store');
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-store-active', 'user-1');
    expect(mockRetryTurn.mock.calls[0][0].conversationRef).toBe('conv-store-active');
  });

  test('does not dispatch SDK commands for empty replay targets', async () => {
    const { result } = renderHook(() => useConversationReplayActions());

    await act(async () => {
      await result.current.handleTryAgainFromAssistant(' ');
      await result.current.handleEditFromUser('renderer-user-1', ' ');
      await result.current.handleEditFromUser(' ', 'edited question');
    });

    expect(mockRetryTurn).not.toHaveBeenCalled();
    expect(mockEditAndResend).not.toHaveBeenCalled();
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
