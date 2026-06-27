/**
 * Covers chat interface wiring. behavior in the frontend test suite.
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import ChatInterface from '../../src/renderer/features/chat/components/ChatInterface';
import { DesktopChatEventsRuntime } from '../../src/renderer/app/runtime/desktopChatEvents';
const { selectMockStoreState: mockSelectStoreState } = require('./storeSelectorTestUtils.cjs');

const {
  dispatchDesktopRuntimeNewChatEvent,
} = DesktopChatEventsRuntime;

const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: jest.fn(),
}));
let mockConfig = {
  interaction_mode: 'chat',
  speech_mode_enabled: false,
  show_tool_logs: false,
  model_provider: 'openai',
  selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
};
let mockAvailableModels = {
  local: [],
  online: [],
};
const mockUpdateConfig = jest.fn();
const mockMessageInput = jest.fn(() => <div data-testid="message-input" />);

const mockPlayerService = {
  cleanup: jest.fn(),
  enqueueAudio: jest.fn(),
  stopPlayback: jest.fn(),
};
const mockStopQuery = jest.fn();
const mockCompactHistory = jest.fn();
const mockSendQuery = jest.fn();
const mockSendRehydrateConversation = jest.fn();
const mockSetModel = jest.fn();
const mockUpdateSettings = jest.fn();
const mockRewriteTranscriptProjection = jest.fn(async () => ({ entries: [], messages: [] }));
const mockLoadDisplayTimeline = jest.fn();
const mockReplaceRows = jest.fn();
const mockEditAndResend = jest.fn();
const mockRetryTurn = jest.fn();
const mockListRevisions = jest.fn();
const mockCheckoutRevision = jest.fn();
const mockForkConversation = jest.fn();
const mockIsDevUiEnabled = jest.fn(() => false);
const mockClearMessages = jest.fn();
const mockSetMessages = jest.fn();
const mockSetConversationView = jest.fn();
const mockUpdateMessage = jest.fn();
const mockSetIsSending = jest.fn();
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();
const mockSetTokenCounts = jest.fn();
const mockAcceptStoppedTurn = jest.fn();
const mockAcceptPendingTurn = jest.fn();
const mockClearPendingTurn = jest.fn();
const mockSetChatActiveConversationRef = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
const mockGetActiveConversationRef = jest.fn(() => 'conv_existing');
const mockGetTranscriptSessionInfo = jest.fn(() => ({
  conversationRef: 'conv_existing',
  userId: 'default_user',
}));
const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockIpcListeners = new Map();
const mockMessageList = jest.fn(() => <div data-testid="message-list" />);
let mockTranscriptSessionSnapshot = {
  conversationRef: 'conv_existing',
  userId: 'default_user',
};
const mockChatState = {
  activeConversationRef: 'conv_existing',
  messages: [],
  isSending: false,
  thinkingStatus: null,
  thinkingSourceEventType: null,
  tokenCounts: null,
  streamTracking: { phase: 'idle' },
  sdkLiveTurn: null,
  conversationView: null,
  pendingTurn: null,
  clearMessages: (...args) => mockClearMessages(...args),
  setMessages: (...args) => mockSetMessages(...args),
  updateMessage: (...args) => mockUpdateMessage(...args),
  setIsSending: (...args) => mockSetIsSending(...args),
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventType: (...args) => mockSetThinkingSourceEventType(...args),
  setTokenCounts: (...args) => mockSetTokenCounts(...args),
  acceptStoppedTurn: (...args) => mockAcceptStoppedTurn(...args),
  acceptPendingTurn: (pendingTurn) => {
    mockChatState.pendingTurn = pendingTurn;
    mockChatState.isSending = true;
    mockAcceptPendingTurn(pendingTurn);
  },
  clearPendingTurn: (...args) => {
    mockChatState.pendingTurn = null;
    mockClearPendingTurn(...args);
  },
  setActiveConversationRef: (...args) => mockSetChatActiveConversationRef(...args),
};

function timelineRowsFromMessages(messages, conversationRef = 'conv_existing', revisionId = 'rev-base') {
  return messages.map((message, index) => ({
    id: message.id,
    conversationRef,
    revisionId,
    index,
    role: message.sender === 'user' ? 'user' : 'assistant',
    type: message.sender === 'user' ? 'user_message' : 'assistant_message',
    content: message.text,
    metadata: { revisionId },
  }));
}

function setMockCurrentTurnProjection(phase, overrides = {}) {
  const normalizedPhase = {
    'awaiting-first-chunk': 'awaiting',
    'tool-call': 'tool_call',
    'tool-output': 'tool_output',
  }[phase] || phase;
  mockChatState.sdkLiveTurn = {
    conversationRef: 'conv_existing',
    turnRef: 'turn_test',
    phase: normalizedPhase,
    assistantText: '',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
    ...overrides,
  };
}

function setMockConversationView(overrides = {}) {
  const conversationRef = overrides.conversationRef ?? 'conv_existing';
  const turnRef = overrides.turnRef ?? 'turn_test';
  const phase = overrides.phase ?? 'streaming';
  const isBusy = overrides.isBusy ?? true;
  const canStop = overrides.canStop ?? true;
  mockChatState.conversationView = {
    conversationRef,
    revisionId: overrides.revisionId ?? 'rev-test',
    displayRows: overrides.displayRows ?? [],
    liveTurn: {
      turnRef,
      phase,
      entries: overrides.entries ?? [{ id: 'entry-test', text: 'streaming response' }],
      isBusy,
      isTerminal: overrides.isTerminal ?? !isBusy,
      canStop,
      lastError: null,
      ...(overrides.liveTurn ?? {}),
    },
    surfaces: {
      pill: {
        mode: overrides.pillMode ?? (isBusy ? 'busy' : 'idle'),
      },
      dashboard: {
        mode: overrides.dashboardMode ?? (isBusy ? 'busy' : 'idle'),
      },
      responseOverlay: {
        mode: overrides.responseOverlayMode ?? (isBusy ? 'response' : 'hidden'),
        visible: overrides.responseOverlayVisible ?? isBusy,
        guardRef: overrides.guardRef ?? turnRef,
        ownerConversationRef: overrides.ownerConversationRef ?? conversationRef,
        turnRef,
        ...(overrides.responseOverlay ?? {}),
      },
    },
    actions: {
      canEdit: true,
      canRetry: true,
      canFork: true,
      ...(overrides.actions ?? {}),
    },
  };
}

jest.mock('../../src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (selector) => mockSelectStoreState(selector, mockChatState),
    { getState: () => mockChatState },
  ),
  selectChatInterfaceState: (state) => {
    const {
      DesktopChatInterfaceSelectorRuntime,
    } = jest.requireActual(
      '../../src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime',
    );
    const {
      projectWorkspaceReadModelState,
    } = jest.requireActual(
      '../../src/renderer/app/runtime/desktopChatWorkspaceStateRuntime',
    );
    const activeWorkspace = {
      messages: state.messages,
      isSending: state.isSending,
      thinkingStatus: state.thinkingStatus,
      thinkingSourceEventType: state.thinkingSourceEventType,
      compactionDebugInfo: state.compactionDebugInfo ?? null,
      tokenCounts: state.tokenCounts,
      streamTracking: state.streamTracking,
      sdkLiveTurn: state.sdkLiveTurn,
      conversationView: state.conversationView,
      pendingTurn: state.pendingTurn,
    };
    return DesktopChatInterfaceSelectorRuntime.buildChatInterfaceSelectorState({
      activeConversationRef: state.activeConversationRef,
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    });
  },
  setConversationViewInChatStore: (...args) => {
    mockChatState.conversationView = args[0] ?? null;
    mockSetConversationView(...args);
  },
  addMessageToChatStore: (...args) => mockChatState.addMessage(...args),
  clearMessagesInChatStore: (...args) => mockChatState.clearMessages(...args),
  updateMessageInChatStore: (...args) => mockChatState.updateMessage(...args),
  acceptPendingTurnInChatStore: (...args) => mockChatState.acceptPendingTurn(...args),
  clearPendingTurnInChatStore: (...args) => mockChatState.clearPendingTurn(...args),
  acceptStoppedTurnInChatStore: (...args) => mockChatState.acceptStoppedTurn(...args),
  setIsSendingInChatStore: (...args) => mockSetIsSending(...args),
  setThinkingStatusInChatStore: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventTypeInChatStore: (...args) => mockSetThinkingSourceEventType(...args),
  setTokenCountsInChatStore: (...args) => mockSetTokenCounts(...args),
}));

jest.mock('../../src/renderer/features/chat/stores/chatStoreAdapters', () => ({
  executeReplayActionFromChatStore: jest.fn(async (input = {}) => {
    if (input.action === 'edit_resend') {
      return mockEditAndResend({
        conversationRef: mockChatState.activeConversationRef || 'conv_existing',
        userId: 'default_user',
        messageId: typeof input.userMessageId === 'string' ? input.userMessageId.trim() : input.userMessageId,
        text: typeof input.editedText === 'string' ? input.editedText.trim() : input.editedText,
      });
    }
    if (input.action === 'retry') {
      return mockRetryTurn({
        conversationRef: mockChatState.activeConversationRef || 'conv_existing',
        userId: 'default_user',
        messageId: typeof input.assistantMessageId === 'string'
          ? input.assistantMessageId.trim()
          : input.assistantMessageId,
      });
    }
    return undefined;
  }),
  clearMessagesInChatStore: (...args) => {
    mockChatState.messages = [];
    mockChatState.sdkLiveTurn = null;
    mockChatState.conversationView = null;
    mockChatState.pendingTurn = null;
    mockClearMessages(...args);
  },
  updateMessageInChatStore: (...args) => mockChatState.updateMessage(...args),
  setConversationViewInChatStore: (...args) => {
    mockChatState.conversationView = args[0] ?? null;
    mockSetConversationView(...args);
  },
  setThinkingStatusInChatStore: (...args) => {
    mockChatState.thinkingStatus = args[0] ?? null;
    mockSetThinkingStatus(...args);
  },
  setThinkingSourceEventTypeInChatStore: (...args) => {
    mockChatState.thinkingSourceEventType = args[0] ?? null;
    mockSetThinkingSourceEventType(...args);
  },
  setTokenCountsInChatStore: (...args) => {
    mockChatState.tokenCounts = args[0] ?? null;
    mockSetTokenCounts(...args);
  },
  acceptStoppedTurnInChatStore: (...args) => mockChatState.acceptStoppedTurn(...args),
  acceptPendingTurnInChatStore: (...args) => mockChatState.acceptPendingTurn(...args),
  clearPendingTurnInChatStore: (...args) => mockChatState.clearPendingTurn(...args),
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => ({
    config: mockConfig,
    availableModels: mockAvailableModels,
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../src/renderer/infrastructure/audio/PlayerService', () => ({
  PlayerService: jest.fn(() => mockPlayerService),
}));

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: () => mockIsDevUiEnabled(),
  },
}));

jest.mock('../../src/renderer/app/skin/desktopRuntimeSkin', () => {
  const desktopRuntimeSkin = {
    chat: {
      emptyTitle: 'Welcome to Sample Desktop Demo',
      replayPreparationFailureMessage: 'Sample app could not prepare the conversation replay.',
      sendFailureMessage: 'Sample app is not connected right now.',
    },
  };
  return {
    desktopRuntimeSkin,
    DesktopRuntimeSkin: {
      desktopRuntimeSkin,
    },
  };
});

jest.mock('../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    stop: (...args) => mockStopQuery(...args),
    sendQuery: (...args) => mockSendQuery(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
    updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
    getActiveConversationRef: (...args) => mockGetActiveConversationRef(...args),
    getTranscriptSessionInfo: (...args) => mockGetTranscriptSessionInfo(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: (...args) => mockSetModel(...args),
    updateSettings: (...args) => mockUpdateSettings(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    compactHistory: (...args) => mockCompactHistory(...args),
    loadDisplayTimeline: (...args) => mockLoadDisplayTimeline(...args),
    replaceRows: (...args) => mockReplaceRows(...args),
    editAndResend: (...args) => mockEditAndResend(...args),
    retryTurn: (...args) => mockRetryTurn(...args),
    listRevisions: (...args) => mockListRevisions(...args),
    checkoutRevision: (...args) => mockCheckoutRevision(...args),
    forkConversation: (...args) => mockForkConversation(...args),
  },
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
    on: (channel, listener) => {
      mockIpcListeners.set(channel, listener);
      return () => {
        mockIpcListeners.delete(channel);
      };
    },
    invoke: (...args) => mockIpcInvoke(...args),
  },
  SEND_CHANNELS: {
    DESKTOP_RUNTIME_PENDING_TURN: 'windie:pending-turn',
  },
  INVOKE_CHANNELS: {
    CHECK_PERMISSION: 'check-permission',
    REQUEST_PERMISSION: 'request-permission',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
  },
  ON_CHANNELS: {
    AUDIO_CHUNK: 'audio-chunk',
    IPC_STATUS: 'ipc-status',
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient', () => ({
  DesktopTranscriptSessionInfoRuntimeClient: {
    useDesktopTranscriptSessionInfo: () => mockTranscriptSessionSnapshot,
  },
}));

jest.mock('../../src/renderer/features/chat/components/MessageList', () => (props) =>
  mockMessageList(props),
);

jest.mock('../../src/renderer/features/chat/components/MessageInput', () => (props) =>
  mockMessageInput(props),
);

jest.mock('../../src/renderer/features/chat/components/ChatBrowserSessionControl', () => () => (
  <div data-testid="chat-browser-session-control" />
));

describe('ChatInterface wiring', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mockConfig = {
      interaction_mode: 'chat',
      speech_mode_enabled: false,
      show_tool_logs: false,
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
    };
    mockAvailableModels = {
      local: [],
      online: [],
    };
    mockMessageInput.mockClear();
    mockUseChatMessageSender.mockClear();
    mockPlayerService.cleanup.mockClear();
    mockPlayerService.enqueueAudio.mockClear();
    mockPlayerService.stopPlayback.mockClear();
    mockStopQuery.mockClear();
    mockCompactHistory.mockClear();
    mockSendQuery.mockClear();
    mockSendRehydrateConversation.mockClear();
    mockSetModel.mockClear();
    mockUpdateSettings.mockClear();
    mockRewriteTranscriptProjection.mockClear();
    mockRewriteTranscriptProjection.mockResolvedValue({ entries: [], messages: [] });
    mockLoadDisplayTimeline.mockClear();
    mockLoadDisplayTimeline.mockImplementation(async (userId, conversationRef) => ({
      conversationRef,
      revisionId: 'rev-base',
      createdAt: '2026-06-22T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: timelineRowsFromMessages(mockChatState.messages, conversationRef),
    }));
    mockReplaceRows.mockClear();
    mockReplaceRows.mockImplementation(async (input) => ({
      conversationRef: input.conversationRef,
      revisionId: 'rev-child',
      createdAt: '2026-06-22T12:01:00.000Z',
      reason: input.reason,
      baseRevisionId: input.baseRevisionId,
      rows: input.rows,
    }));
    mockEditAndResend.mockClear();
    mockEditAndResend.mockImplementation(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    }));
    mockRetryTurn.mockClear();
    mockRetryTurn.mockImplementation(async (input) => ({
      turnRef: input.turnRef,
      queryMessageId: `${input.turnRef}-sdk-evt-000002-user_message`,
    }));
    mockListRevisions.mockClear();
    mockListRevisions.mockResolvedValue([
      {
        conversationRef: 'conv_existing',
        revisionId: 'rev-child',
        parentRevisionId: 'rev-base',
        operation: 'edit',
        active: true,
        updatedAt: '2026-06-22T12:01:00.000Z',
      },
      {
        conversationRef: 'conv_existing',
        revisionId: 'rev-base',
        parentRevisionId: null,
        operation: 'send',
        active: false,
        updatedAt: '2026-06-22T12:00:00.000Z',
      },
    ]);
    mockCheckoutRevision.mockClear();
    mockCheckoutRevision.mockImplementation(async (input) => ({
      displayTimeline: {
        conversationRef: input.conversationRef,
        revisionId: input.revisionId,
        createdAt: '2026-06-22T12:01:00.000Z',
        rows: [],
      },
      modelHistoryCheckpoint: null,
      view: {
        conversationRef: input.conversationRef,
        revisionId: input.revisionId,
        displayRows: [
          {
            id: 'row-checked-out',
            conversationRef: input.conversationRef,
            revisionId: input.revisionId,
            role: 'user',
            type: 'user_message',
            content: 'checked out branch',
            metadata: { revisionId: input.revisionId },
          },
        ],
        liveTurn: {
          turnRef: null,
          phase: 'idle',
          entries: [],
          isBusy: false,
          isTerminal: true,
          canStop: false,
          lastError: null,
        },
        surfaces: {
          pill: { mode: 'idle' },
          dashboard: { mode: 'idle' },
          responseOverlay: {
            mode: 'hidden',
            visible: false,
            guardRef: null,
            ownerConversationRef: input.conversationRef,
            turnRef: null,
          },
        },
        actions: {
          canEdit: true,
          canRetry: true,
          canFork: true,
        },
      },
    }));
    mockForkConversation.mockClear();
    mockForkConversation.mockImplementation(async (input) => ({
      conversationRef: 'conv-forked',
      revisionId: 'rev-forked',
      sourceConversationRef: input.conversationRef,
      sourceRevisionId: input.sourceRevisionId,
      cutAfterRowId: input.cutAfterRowId,
      displayRowCount: 1,
      modelHistoryRowCount: 1,
      view: {
        conversationRef: 'conv-forked',
        revisionId: 'rev-forked',
        displayRows: [
          {
            id: 'row-forked',
            conversationRef: 'conv-forked',
            revisionId: 'rev-forked',
            role: 'user',
            type: 'user_message',
            content: 'forked branch',
            metadata: { revisionId: 'rev-forked' },
          },
        ],
        liveTurn: {
          turnRef: null,
          phase: 'idle',
          entries: [],
          isBusy: false,
          isTerminal: true,
          canStop: false,
          lastError: null,
        },
        surfaces: {
          pill: { mode: 'idle' },
          dashboard: { mode: 'idle' },
          responseOverlay: {
            mode: 'hidden',
            visible: false,
            guardRef: null,
            ownerConversationRef: 'conv-forked',
            turnRef: null,
          },
        },
        actions: {
          canEdit: true,
          canRetry: true,
          canFork: true,
        },
      },
    }));
    mockClearMessages.mockClear();
    mockSetMessages.mockClear();
    mockSetConversationView.mockClear();
    mockUpdateMessage.mockClear();
    mockSetIsSending.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockSetTokenCounts.mockClear();
    mockAcceptStoppedTurn.mockClear();
    mockAcceptPendingTurn.mockClear();
    mockClearPendingTurn.mockClear();
    mockSetChatActiveConversationRef.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockGetActiveConversationRef.mockClear();
    mockGetActiveConversationRef.mockImplementation(() => 'conv_existing');
    mockGetTranscriptSessionInfo.mockClear();
    mockGetTranscriptSessionInfo.mockImplementation(() => ({
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    mockIpcInvoke.mockClear();
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: false,
              details: {
                selected_paths: [],
              },
            },
          },
        };
      }
      return { success: true };
    });
    mockIpcListeners.clear();
    mockMessageList.mockClear();
    mockUpdateConfig.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    mockTranscriptSessionSnapshot = {
      conversationRef: 'conv_existing',
      userId: 'default_user',
    };
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.sdkLiveTurn = null;
    mockChatState.conversationView = null;
    mockChatState.pendingTurn = null;
    mockChatState.messages = [];
    mockChatState.isSending = false;
    mockChatState.thinkingStatus = null;
    mockChatState.thinkingSourceEventType = null;
  });

  test('uses main-window sender surface for centralized send behavior', () => {
    render(<ChatInterface />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(
      expect.any(Function),
      { senderSurface: 'main-window' },
    );
  });

  test('does not clear active conversation mapping when transcript session conversation is temporarily null', () => {
    mockTranscriptSessionSnapshot = {
      conversationRef: null,
      userId: 'default_user',
    };

    render(<ChatInterface />);

    expect(mockSetChatActiveConversationRef).not.toHaveBeenCalledWith(null);
  });

  test('keeps tool call and output rows in dashboard thread presentation', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'List the active workspace contents.',
          },
        },
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        text: 'raw output',
        type: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        isComplete: true,
      },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
      'llm-text',
    ]);
  });

  test('revision menu checks out a branch through the SDK view result', async () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Conversation revisions' }));

    await waitFor(() => {
      expect(mockListRevisions).toHaveBeenCalledWith('default_user', 'conv_existing', 50);
    });
    const revisionItem = await screen.findByText('rev-base');
    fireEvent.click(revisionItem);

    await waitFor(() => {
      expect(mockCheckoutRevision).toHaveBeenCalledWith({
        userId: 'default_user',
        conversationRef: 'conv_existing',
        revisionId: 'rev-base',
      });
    });
    expect(mockSetConversationView).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRef: 'conv_existing',
        revisionId: 'rev-base',
      }),
      'conv_existing',
    );
    expect(mockSetMessages).not.toHaveBeenCalled();
  });

  test('revision menu forks a branch and switches to the forked SDK view', async () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Conversation revisions' }));

    await waitFor(() => {
      expect(mockListRevisions).toHaveBeenCalled();
    });
    const forkButton = await screen.findByRole('button', { name: 'Fork revision rev-base' });
    fireEvent.click(forkButton);

    await waitFor(() => {
      expect(mockForkConversation).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'default_user',
        conversationRef: 'conv_existing',
        sourceRevisionId: 'rev-base',
      }));
    });
    expect(mockForkConversation.mock.calls[0][0]).not.toHaveProperty('cutAfterRowId');
    const forkInput = mockForkConversation.mock.calls[0][0];
    expect(forkInput).not.toHaveProperty('newConversationRef');
    expect(mockLoadDisplayTimeline).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(
      'conv-forked',
      'default_user',
    );
    expect(mockSetChatActiveConversationRef).toHaveBeenCalledWith('conv-forked');
    expect(mockSetConversationView).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRef: 'conv-forked',
        revisionId: 'rev-forked',
      }),
      'conv-forked',
    );
  });

  test('shows raw tool-call rows while the active loop is still running', () => {
    mockChatState.isSending = true;
    mockChatState.streamTracking.phase = 'tool-output';
    setMockCurrentTurnProjection('tool-output');
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Open a folder' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'filesystem_workspace_access',
            explanation: 'Check the selected workspace before reading files.',
          },
        },
      },
    ];

    render(<ChatInterface />);

    const lastCall = mockMessageList.mock.calls.at(-1)[0];
    expect(lastCall.awaitingDotTargetMessageId).toBeNull();
    expect(lastCall.messages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
    ]);
    expect(lastCall.messages[1].text).toBe('raw tool call');
  });

  test('hides awaiting dot while live web-search progress is visible', () => {
    mockChatState.isSending = true;
    mockChatState.streamTracking.phase = 'tool-call';
    setMockCurrentTurnProjection('tool-call');
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'search-1',
        sender: 'assistant',
        text: 'Searching web',
        type: 'search-source',
        sourceEventType: 'web-search-progress',
      },
    ];

    render(<ChatInterface />);

    const lastCall = mockMessageList.mock.calls.at(-1)[0];
    expect(lastCall.awaitingDotTargetMessageId).toBeNull();
    expect(lastCall.messages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'search-source',
    ]);
    expect(lastCall.messages[1].text).toBe('Searching web');
  });

  test('shows awaiting dot for a later user message when only prior-turn progress is visible', () => {
    mockChatState.isSending = true;
    mockChatState.streamTracking.phase = 'awaiting-first-chunk';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Search the web' },
      {
        id: 'search-1',
        sender: 'assistant',
        text: 'Searching web',
        type: 'search-source',
        sourceEventType: 'web-search-progress',
      },
      { id: 'user-2', sender: 'user', text: 'Summarize it now' },
    ];
    mockChatState.pendingTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending_2',
      userMessageId: 'user-2',
      text: 'Summarize it now',
      timestamp: '2026-06-21T00:00:00.000Z',
      attachmentFilenames: null,
    };

    render(<ChatInterface />);

    const lastCall = mockMessageList.mock.calls.at(-1)[0];
    expect(lastCall.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('keeps raw tool-call rows visible until the assistant reply is complete', () => {
    mockChatState.streamTracking.phase = 'complete';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'read_file',
            explanation: 'Read the selected workspace entry before summarizing it.',
          },
        },
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'I’ve explored the selected file and I’m summarizing it now.',
        type: 'llm-text',
        isComplete: false,
      },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'llm-text',
    ]);
    expect(renderedMessages[1].text).toBe('raw tool call');
  });

  test('passes raw tool rows through without reading the tool-log toggle', () => {
    mockConfig = {
      ...mockConfig,
      show_tool_logs: true,
    };
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      { id: 'tool-call-1', sender: 'assistant', text: 'raw tool call', type: 'tool-call' },
      { id: 'tool-output-1', sender: 'assistant', text: 'raw output', type: 'tool-output' },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
    ]);
  });

  test('keeps existing transcript row order when the unused tool-log toggle flips', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'List the active workspace contents.',
          },
        },
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        text: 'raw output',
        type: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        isComplete: true,
      },
    ];

    const { rerender } = render(<ChatInterface />);

    let renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
      'llm-text',
    ]);

    mockConfig = {
      ...mockConfig,
      show_tool_logs: true,
    };
    rerender(<ChatInterface />);

    renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
      'llm-text',
    ]);

    mockConfig = {
      ...mockConfig,
      show_tool_logs: false,
    };
    rerender(<ChatInterface />);

    renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
      'llm-text',
    ]);
  });

  test('shows text-to-speech toggle in header', () => {
    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Toggle text-to-speech' })).toBeInTheDocument();
  });

  test('subscribes to typed audio chunks without backend-wire stream traffic', () => {
    render(<ChatInterface />);

    expect(mockIpcListeners.has('audio-chunk')).toBe(true);
    expect(mockIpcListeners.has('windie:conversation-event')).toBe(false);

    act(() => {
      mockIpcListeners.get('audio-chunk')?.({
        type: 'audio-chunk',
        payload: { audio: 'abc', sample_rate: 24000 },
      });
    });

    expect(mockPlayerService.enqueueAudio).toHaveBeenCalledWith({
      audio: 'abc',
      sample_rate: 24000,
    });
  });

  test('shows the active workspace name next to the text-to-speech toggle', async () => {
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['/Users/peterbui/Projects/project-alpha'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    render(<ChatInterface />);

    expect(await screen.findByRole('button', { name: 'Change active workspace from project-alpha' })).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('project-alpha')).toBeInTheDocument();
  });

  test('updates the active workspace badge when the main process broadcasts a workspace change', async () => {
    render(<ChatInterface />);

    await waitFor(() => {
      expect(mockIpcListeners.has('workspace-access-updated')).toBe(true);
    });

    act(() => {
      mockIpcListeners.get('workspace-access-updated')?.({
        granted: true,
        workspaceName: 'client-demo',
        workspacePath: '/Users/peterbui/client-demo',
      });
    });

    expect(await screen.findByRole('button', { name: 'Change active workspace from client-demo' })).toBeInTheDocument();
  });

  test('workspace button requests a new workspace selection', async () => {
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: false,
              details: {
                selected_paths: [],
              },
            },
          },
        };
      }
      if (channel === 'request-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['D:\\Assistants\\project-alpha'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    render(<ChatInterface />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set active workspace' }));

    await waitFor(() => {
      expect(mockIpcInvoke).toHaveBeenCalledWith('request-permission', {
        permissionId: 'filesystem_workspace_access',
      });
    });
    expect(
      await screen.findByRole('button', { name: 'Change active workspace from project-alpha' }),
    ).toBeInTheDocument();
  });

  test('window controls invoke minimize, maximize, and close IPC channels', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    expect(mockIpcInvoke).toHaveBeenCalledWith('window-minimize');
    expect(mockIpcInvoke).toHaveBeenCalledWith('window-toggle-maximize');
    expect(mockIpcInvoke).toHaveBeenCalledWith('window-close');
  });

  test('hides native window controls when vm_mode query flag is enabled', () => {
    window.history.replaceState({}, '', '/?vm_mode=1');
    render(<ChatInterface />);

    expect(screen.queryByRole('button', { name: 'Minimize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle maximize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close window' })).not.toBeInTheDocument();
  });

  test('does not render a connection warning when runtime transport disconnects', () => {
    render(<ChatInterface />);
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();

    act(() => {
      mockIpcListeners.get('ipc-status')?.({ isConnected: false });
    });
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();

    act(() => {
      mockIpcListeners.get('ipc-status')?.({ isConnected: true });
    });
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();
  });

  test('does not render a duplicate header logo when sidebar is collapsed', () => {
    const { container } = render(<ChatInterface sidebarOpen={false} />);

    expect(container.querySelector('.chat-header-brand-dot')).toBeNull();
  });

  test('text-to-speech toggle updates speech_mode_enabled', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle text-to-speech' }));
    expect(mockUpdateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
  });

  test('does not render dashboard auto-compaction control when dev UI is disabled', () => {
    render(<ChatInterface />);
    expect(screen.queryByRole('button', { name: 'Run auto compaction' })).not.toBeInTheDocument();
  });

  test('runs compact-history from dashboard when dev auto-compaction control is clicked', async () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    mockConfig = {
      interaction_mode: 'chat',
      speech_mode_enabled: false,
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    };
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Run auto compaction' }));
    expect(mockSetThinkingStatus).toHaveBeenCalledWith('Compacting conversation history...');
    expect(mockSetThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started');
    await waitFor(() => {
      expect(mockSetModel).toHaveBeenCalledWith({
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      });
      expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv_existing');
    });
    expect(mockSetModel.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompactHistory.mock.invocationCallOrder[0],
    );
  });

  test('keeps dashboard compaction control clickable even during active stream phases', async () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    mockChatState.streamTracking.phase = 'streaming';
    render(<ChatInterface />);

    const button = screen.getByRole('button', { name: 'Run auto compaction' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(mockSetThinkingStatus).toHaveBeenCalledWith('Compacting conversation history...');
    expect(mockSetThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started');
    await waitFor(() => {
      expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv_existing');
    });
  });

  test('shows model selector and passes composer handlers to input', () => {
    mockConfig = {
      interaction_mode: 'agent',
      model_mode: 'online',
      model_provider: 'openai',
      speech_mode_enabled: false,
      selected_model_id: 'gpt-test-model',
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gpt-test-model', provider: 'openai' },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('gpt-test-model');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(false);
    expect(lastInputProps.isCentered).toBe(true);
    expect(typeof lastInputProps.onSendMessage).toBe('function');
    expect(typeof lastInputProps.onStopResponse).toBe('function');
  });

  test('renders curated model display label when selected_model_id is a runtime id', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Model selector' })).not.toHaveTextContent('gpt-5.4');
  });

  test('renders the first curated model instead of stale unavailable selected ids', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'stale-unavailable-model',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Model selector' })).not.toHaveTextContent('stale-unavailable-model');
  });

  test('deduplicates model dropdown entries to one base model and shows reasoning mode selector when supported', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-medium-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 Medium',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('None');

    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));
    expect(screen.getAllByRole('menuitem', { name: 'GPT-5.4' })).toHaveLength(1);
  });

  test('does not show reasoning mode selector for models without multiple reasoning levels', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'anthropic',
      selected_model_id: 'claude-haiku-4-5',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'claude-haiku-4-5',
          runtime_model_id: 'claude-haiku-4-5',
          provider: 'anthropic',
          display_name: 'Claude Haiku 4.5',
          supports_thinking: false,
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.queryByRole('button', { name: 'Reasoning mode selector' })).not.toBeInTheDocument();
  });

  test('falls back to default model label when config is missing', () => {
    mockConfig = null;
    mockAvailableModels = { local: [], online: [] };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('No models available');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isCentered).toBe(true);
  });

  test('model selector lists only models for selected provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gemini-3.1-pro-preview', provider: 'gemini' },
        { id: 'gemini-2.5-flash', provider: 'gemini' },
        { id: 'gpt-5.4@@gpt-5-4-none-thinking', provider: 'openai' },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));

    expect(screen.getByRole('menuitem', { name: 'gemini-3.1-pro-preview' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'gemini-2.5-flash' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'gpt-5.4@@gpt-5-4-none-thinking' })).not.toBeInTheDocument();
  });

  test('selecting a model updates config with model id and provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gemini-3.1-pro-preview', provider: 'gemini' },
        { id: 'gemini-2.5-flash', provider: 'gemini' },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'gemini-2.5-flash' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gemini-2.5-flash',
      model_provider: 'gemini',
    });
  });

  test('selecting reasoning mode updates config with matching model variant id', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-medium-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 Medium',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Reasoning mode selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
  });

  test('shows reasoning mode selector for gemini model families with low/medium/high variants', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3-1-pro-low-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gemini-3-1-pro-low-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro Low',
          supports_thinking: true,
          reasoning_mode: 'low',
        },
        {
          id: 'gemini-3-1-pro-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gemini-3-1-pro-high-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('Gemini 3.1 Pro');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('Low');

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning mode selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gemini-3-1-pro-high-thinking',
      model_provider: 'gemini',
    });
  });

  test('shows reasoning mode selector for anthropic model families with low/medium/high variants', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5-low-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'claude-sonnet-4-5-low-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5 Low',
          supports_thinking: true,
          reasoning_mode: 'low',
        },
        {
          id: 'claude-sonnet-4-5-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'claude-sonnet-4-5-high-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('Claude Sonnet 4.5');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('Low');
  });

  test('renders welcome empty state when there are no messages', () => {
    render(<ChatInterface />);
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Sample Desktop Demo')).toBeInTheDocument();
  });

  test('renders history loading state instead of welcome state while selected chat rows load', () => {
    render(<ChatInterface loadingConversationRef="conv_existing" />);

    expect(screen.getByTestId('chat-history-loading-state')).toBeInTheDocument();
    expect(screen.getByText('Loading chat')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome to Sample Desktop Demo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-input')).not.toBeInTheDocument();
  });

  test('stop response handler sends stop-query while ConversationView stream is active', () => {
    mockChatState.streamTracking.phase = 'streaming';
    setMockCurrentTurnProjection('streaming', {
      assistantText: 'streaming response',
    });
    setMockConversationView({
      entries: [{ id: 'entry-test', text: 'streaming response' }],
    });

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(typeof lastInputProps.onStopResponse).toBe('function');
    lastInputProps.onStopResponse();
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockStopQuery).toHaveBeenCalledWith('conv_existing', 'turn_test');
    expect(mockAcceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_existing',
      turnRef: 'turn_test',
    });
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
  });

  test('stop response handler targets the ConversationView conversation when session ref is stale', () => {
    mockTranscriptSessionSnapshot = {
      conversationRef: 'conv_stale_session',
      userId: 'default_user',
    };
    mockChatState.streamTracking.phase = 'streaming';
    setMockCurrentTurnProjection('streaming', {
      conversationRef: 'conv_visible_turn',
      turnRef: 'turn_visible',
      assistantText: 'streaming response',
    });
    setMockConversationView({
      conversationRef: 'conv_visible_turn',
      turnRef: 'turn_visible',
      entries: [{ id: 'entry-visible', text: 'streaming response' }],
    });

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    lastInputProps.onStopResponse();

    expect(mockStopQuery).toHaveBeenCalledWith('conv_visible_turn', 'turn_visible');
    expect(mockSetChatActiveConversationRef).toHaveBeenCalledWith('conv_visible_turn');
    expect(mockAcceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_visible_turn',
      turnRef: 'turn_visible',
    });
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
  });

  test('stop response handler targets the ConversationView turn over stale current-turn state', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv_stale_current',
      turnRef: 'turn_stale_current',
      phase: 'streaming',
      assistantText: 'stale stream',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    mockChatState.conversationView = {
      conversationRef: 'conv_view',
      revisionId: 'rev-view',
      displayRows: [],
      liveTurn: {
        turnRef: 'turn_view',
        phase: 'streaming',
        entries: [{ id: 'entry-view', text: 'view stream' }],
        isBusy: true,
        isTerminal: false,
        canStop: true,
        lastError: null,
      },
      surfaces: {
        pill: {
          mode: 'busy',
        },
        dashboard: {
          mode: 'busy',
        },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn_view',
          ownerConversationRef: 'conv_view',
          turnRef: 'turn_view',
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    };

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(true);
    expect(lastInputProps.canStopResponse).toBe(true);
    lastInputProps.onStopResponse();

    expect(mockStopQuery).toHaveBeenCalledWith('conv_view', 'turn_view');
    expect(mockSetChatActiveConversationRef).toHaveBeenCalledWith('conv_view');
    expect(mockAcceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_view',
      turnRef: 'turn_view',
    });
  });

  test('ConversationView can clear dashboard busy and Stop over stale current-turn state', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_stale_current',
      phase: 'streaming',
      assistantText: 'stale stream',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    mockChatState.conversationView = {
      conversationRef: 'conv_existing',
      revisionId: 'rev-view',
      displayRows: [],
      liveTurn: {
        turnRef: 'turn_replacement',
        phase: 'complete',
        entries: [{ id: 'entry-done', text: 'done' }],
        isBusy: false,
        isTerminal: true,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: {
          mode: 'idle',
        },
        dashboard: {
          mode: 'idle',
        },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn_replacement',
          ownerConversationRef: 'conv_existing',
          turnRef: 'turn_replacement',
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    };

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(false);
    expect(lastInputProps.canStopResponse).toBe(false);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();
  });

  test('ConversationView busy mode disables dashboard Stop when view cannot stop', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_stale_current',
      phase: 'streaming',
      assistantText: 'stale stream',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    mockChatState.conversationView = {
      conversationRef: 'conv_existing',
      revisionId: 'rev-view',
      displayRows: [],
      liveTurn: {
        turnRef: 'turn_view_busy',
        phase: 'tool',
        entries: [{ id: 'entry-tool', text: 'tool progress' }],
        isBusy: true,
        isTerminal: false,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: {
          mode: 'busy',
        },
        dashboard: {
          mode: 'busy',
        },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn_view_busy',
          ownerConversationRef: 'conv_existing',
          turnRef: 'turn_view_busy',
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    };

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(true);
    expect(lastInputProps.canStopResponse).toBe(false);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();
  });

  test('dashboard loop state follows ConversationView dashboard mode over pill mode', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_stale_current',
      phase: 'streaming',
      assistantText: 'stale stream',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    mockChatState.conversationView = {
      conversationRef: 'conv_existing',
      revisionId: 'rev-view',
      displayRows: [],
      liveTurn: {
        turnRef: 'turn_split_surface',
        phase: 'streaming',
        entries: [{ id: 'entry-live', text: 'live on another surface' }],
        isBusy: true,
        isTerminal: false,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: {
          mode: 'busy',
        },
        dashboard: {
          mode: 'idle',
        },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn_split_surface',
          ownerConversationRef: 'conv_existing',
          turnRef: 'turn_split_surface',
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    };

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(false);
    expect(lastInputProps.canStopResponse).toBe(false);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();
  });

  test('stop shortcut sends stop-query while stream is active', () => {
    mockChatState.streamTracking.phase = 'streaming';
    setMockCurrentTurnProjection('streaming', {
      assistantText: 'streaming response',
    });
    setMockConversationView({
      entries: [{ id: 'entry-test', text: 'streaming response' }],
    });

    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(shortcutEvent);

    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockStopQuery).toHaveBeenCalledWith('conv_existing', 'turn_test');
    expect(mockAcceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_existing',
      turnRef: 'turn_test',
    });
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
  });

  test('raw current-turn stream alone does not enable Stop', () => {
    mockChatState.streamTracking.phase = 'streaming';
    setMockCurrentTurnProjection('streaming', {
      assistantText: 'streaming response',
    });

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(true);
    expect(lastInputProps.canStopResponse).toBe(false);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(shortcutEvent);

    expect(shortcutEvent.defaultPrevented).toBe(false);
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();
  });

  test('stop shortcut ignores key presses when loop is idle', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(shortcutEvent);

    expect(shortcutEvent.defaultPrevented).toBe(false);
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockAcceptStoppedTurn).not.toHaveBeenCalled();
  });

  test('stop response handler sends stop-query with pending turn immediately after send', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = true;
    mockChatState.pendingTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending',
      userMessageId: 'user_pending',
      text: 'pending',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    };

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(true);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockStopQuery).toHaveBeenCalledWith('conv_existing', 'turn_pending');
    expect(mockAcceptStoppedTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending',
    });
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
  });

  test('keeps composer in stop state during tool loop even when raw isSending is false', () => {
    mockChatState.streamTracking.phase = 'tool-call';
    mockChatState.isSending = false;
    setMockCurrentTurnProjection('tool-call', {
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'run_shell_command',
        text: 'run_shell_command',
      }],
    });
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'build a dashboard' },
      { id: 'assistant-1', sender: 'assistant', text: '{"tool":"run_shell_command"}', type: 'tool-call' },
    ];

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(true);
    expect(typeof lastInputProps.onStopResponse).toBe('function');
  });

  test('renders SDK display tool rows without reading current-turn tool rows as transcript', () => {
    mockChatState.streamTracking.phase = 'tool-call';
    mockChatState.isSending = false;
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'build a dashboard', type: 'user', turnRef: 'turn_test' },
      {
        id: 'tool-call-row-1',
        sender: 'assistant',
        type: 'tool-call',
        text: '{"tool":"run_shell_command"}',
        turnRef: 'turn_test',
        correlationId: 'request-tool-1',
        toolCallDetails: {
          toolName: 'run_shell_command',
        },
      },
    ];
    setMockCurrentTurnProjection('tool-call', {
      toolEvents: [{
        id: 'tool-call-1',
        kind: 'tool_call',
        toolName: 'run_shell_command',
        payload: {
          toolName: 'run_shell_command',
          requestId: 'request-tool-1',
          args: {
            command: 'pwd',
          },
        },
      }],
    });

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages).toHaveLength(2);
    expect(renderedMessages[0]).toEqual(expect.objectContaining({
      id: 'user-1',
      sender: 'user',
    }));
    expect(renderedMessages[1]).toEqual(expect.objectContaining({
      id: 'tool-call-row-1',
      sender: 'assistant',
      type: 'tool-call',
      correlationId: 'request-tool-1',
      toolCallDetails: expect.objectContaining({
        toolName: 'run_shell_command',
      }),
    }));
    expect(mockSetMessages).not.toHaveBeenCalled();
    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });

  test('renders ConversationView live rows instead of stale current-turn rows', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'build a dashboard', type: 'user', turnRef: 'turn-view' },
    ];
    setMockCurrentTurnProjection('streaming', {
      conversationRef: 'conv_existing',
      turnRef: 'turn-stale',
      assistantText: 'stale raw answer',
      presentation: {
        entries: [{
          id: 'raw-entry-1',
          type: 'llm-text',
          text: 'stale raw answer',
          turnRef: 'turn-stale',
        }],
      },
    });
    setMockConversationView({
      turnRef: 'turn-view',
      entries: [{
        id: 'view-entry-1',
        type: 'llm-text',
        text: 'view live answer',
        turnRef: 'turn-view',
      }],
    });

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages).toEqual([
      expect.objectContaining({
        id: 'view-entry-1',
        sender: 'assistant',
        text: 'view live answer',
        sourceChannel: 'sdk:conversation-view',
      }),
    ]);
    expect(renderedMessages).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ id: 'raw-entry-1' }),
    ]));
  });

  test('shows awaiting dot until the first assistant row is visible', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.pendingTurn = {
      conversationRef: 'conv-test',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-26T00:00:00.000Z',
    };
    mockChatState.streamTracking.phase = 'awaiting-first-chunk';
    setMockCurrentTurnProjection('awaiting-first-chunk', {
      conversationRef: 'conv-test',
      turnRef: 'turn-1',
    });
    const { rerender } = render(<ChatInterface />);

    let lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-1');

    mockChatState.streamTracking.phase = 'streaming';
    setMockCurrentTurnProjection('streaming', {
      conversationRef: 'conv-test',
      turnRef: 'turn-1',
      assistantText: 'first chunk',
    });
    mockChatState.pendingTurn = null;
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'first chunk', type: 'llm-text' },
    ];
    rerender(<ChatInterface />);
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBeNull();
  });

  test('hides awaiting dot when the first assistant row only has thinking text', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: '',
        type: 'llm-text',
        thinkingText: 'Planning response',
        thinkingSourceEventType: 'llm-thought',
      },
    ];
    mockChatState.streamTracking.phase = 'awaiting-first-chunk';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBeNull();
  });

  test('passes active conversation ref to MessageList for conversation-switch scroll resets', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.conversationRef).toBe('conv_existing');
  });

  test('shows awaiting dot while local send is pending first token', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = true;
    mockChatState.pendingTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending_1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-21T00:00:00.000Z',
      attachmentFilenames: null,
    };

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-1');
  });

  test('does not show awaiting dot for phase-only streaming without pending or visible content', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.isSending = false;
    setMockCurrentTurnProjection('streaming');

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBeNull();
  });

  test('keeps awaiting dot from renderer pending even when durable tool rows exist', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
      { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
      { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
      { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
    ];
    mockChatState.streamTracking.phase = 'tool-output';
    mockChatState.isSending = true;
    mockChatState.pendingTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending_2',
      userMessageId: 'user-2',
      text: 'second task',
      timestamp: '2026-06-21T00:00:00.000Z',
      attachmentFilenames: null,
    };

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('keeps awaiting dot visible during a later turn while pending turn is active over a terminal previous phase', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
      { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'complete';
    mockChatState.isSending = true;
    mockChatState.pendingTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn_pending_2',
      userMessageId: 'user-2',
      text: 'second task',
      timestamp: '2026-06-21T00:00:00.000Z',
      attachmentFilenames: null,
    };

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('stop response handler is a no-op when no active stream is running', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('SDK current-turn completion clears dashboard busy state over stale stream tracking', () => {
    mockChatState.streamTracking.phase = 'tool-output';
    mockChatState.isSending = false;
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv_existing',
      turnRef: 'turn-complete',
      phase: 'complete',
      assistantText: 'done',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'task', type: 'user', turnRef: 'turn-complete' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text', turnRef: 'turn-complete' },
    ];

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isLoopActive).toBe(false);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBeNull();
  });

  test('dashboard new-chat event clears local conversation state', () => {
    render(<ChatInterface />);

    act(() => {
      dispatchDesktopRuntimeNewChatEvent();
    });

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockSetThinkingStatus.mock.calls).toContainEqual([null, null]);
    expect(mockSetTokenCounts.mock.calls).toContainEqual([null, null]);
    expect(mockUpdateTranscriptSession.mock.calls.some(([conversationRef]) => (
      typeof conversationRef === 'string' && /^conv_/.test(conversationRef)
    ))).toBe(true);
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('dashboard new-chat event does not stop an in-flight conversation', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.isSending = true;

    render(<ChatInterface />);

    act(() => {
      dispatchDesktopRuntimeNewChatEvent();
    });

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockUpdateTranscriptSession.mock.calls.some(([conversationRef]) => (
      typeof conversationRef === 'string' && /^conv_/.test(conversationRef)
    ))).toBe(true);
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('passes assistant message action handlers to MessageList when chat has messages', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.enableAssistantActions).toBe(true);
    expect(lastMessageListProps.disableAssistantActions).toBe(false);
    expect(lastMessageListProps).not.toHaveProperty('canRetryMessages');
    expect(lastMessageListProps).not.toHaveProperty('canEditMessages');
    expect(typeof lastMessageListProps.onAssistantFeedbackChange).toBe('function');
    expect(typeof lastMessageListProps.onAssistantTryAgain).toBe('function');
  });

  test('ConversationView action metadata is not passed as global edit and retry gates', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text', isComplete: true },
    ];
    mockChatState.conversationView = {
      conversationRef: 'conv_existing',
      revisionId: 'rev-view',
      displayRows: timelineRowsFromMessages(mockChatState.messages, 'conv_existing', 'rev-view'),
      liveTurn: {
        turnRef: null,
        phase: 'idle',
        entries: [],
        isBusy: false,
        isTerminal: true,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: { mode: 'idle' },
        dashboard: { mode: 'idle' },
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          guardRef: null,
          ownerConversationRef: 'conv_existing',
          turnRef: null,
        },
      },
      actions: {
        canEdit: false,
        canRetry: false,
        canFork: true,
      },
    };

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.enableAssistantActions).toBe(true);
    expect(lastMessageListProps.enableUserActions).toBe(true);
    expect(lastMessageListProps).not.toHaveProperty('canRetryMessages');
    expect(lastMessageListProps).not.toHaveProperty('canEditMessages');
  });

  test('keeps assistant actions enabled when only raw isSending is stale', () => {
    mockChatState.isSending = true;
    mockChatState.sdkLiveTurn = {
      phase: 'complete',
      conversationRef: 'conv-test',
      turnRef: 'turn-complete',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        typingVisible: false,
        overlayVisible: false,
        isBusy: false,
        isTerminal: true,
        hasVisibleContent: true,
        entries: [{
          id: 'assistant-1',
          type: 'llm-text',
          text: 'done',
        }],
        overlayIntent: {
          visible: false,
          mode: 'hidden',
          turnRef: 'turn-complete',
          conversationRef: 'conv-test',
          staleGuardRef: 'turn-complete',
        },
      },
    };
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', turnRef: 'turn-complete' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text', turnRef: 'turn-complete' },
    ];

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.disableAssistantActions).toBe(false);
  });

  test('assistant feedback action updates message feedback state', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    lastMessageListProps.onAssistantFeedbackChange('assistant-1', 'like');
    expect(mockUpdateMessage).toHaveBeenCalledWith('assistant-1', { feedback: 'like' });
  });

  test('try again rewinds tool loop and re-queries from triggering user message', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-wiring-retry');
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'create a dashboard for this', type: 'user' },
      { id: 'tool-call-1', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call', toolName: 'tool' },
      { id: 'tool-output-1', sender: 'assistant', text: '{"ok":true}', type: 'tool-output', toolName: 'tool' },
      { id: 'assistant-final', sender: 'assistant', text: 'Done.', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    await act(async () => {
      await lastMessageListProps.onAssistantTryAgain('assistant-final');
    });

    expect(mockSetMessages).not.toHaveBeenCalled();
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
    expect(mockAcceptPendingTurn).not.toHaveBeenCalled();

    expect(mockReplaceRows).not.toHaveBeenCalled();
    const retryPayload = mockRetryTurn.mock.calls[0]?.[0];
    expect(retryPayload).toEqual(expect.objectContaining({
      conversationRef: 'conv_existing',
      userId: 'default_user',
      messageId: 'assistant-final',
    }));
    expect(retryPayload).not.toHaveProperty('turnRef');
    expect(retryPayload).not.toHaveProperty('projectionEntries');
    expect(mockSendQuery).not.toHaveBeenCalled();
  });

  test('user edit rewinds assistant output and re-queries with edited text', async () => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-wiring-edit');
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'old prompt', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'old response', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    await act(async () => {
      await lastMessageListProps.onUserEdit('user-1', 'new prompt');
    });

    expect(mockSetMessages).not.toHaveBeenCalled();
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
    expect(mockAcceptPendingTurn).not.toHaveBeenCalled();

    expect(mockReplaceRows).not.toHaveBeenCalled();
    const editPayload = mockEditAndResend.mock.calls[0]?.[0];
    expect(editPayload).toEqual(expect.objectContaining({
      conversationRef: 'conv_existing',
      userId: 'default_user',
      messageId: 'user-1',
      text: 'new prompt',
    }));
    expect(editPayload).not.toHaveProperty('turnRef');
    expect(editPayload).not.toHaveProperty('projectionEntries');
    expect(mockSendQuery).not.toHaveBeenCalled();
  });

  test('command+f opens the find bar and focuses the search input', async () => {
    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(shortcutEvent);
    });

    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('search', { name: 'Find in conversation' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Find in conversation input' }),
      );
    });
  });

  test('find bar computes visible thread matches and wraps next and previous navigation', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Alpha beta alpha' },
      { id: 'assistant-1', sender: 'assistant', text: 'alpha again', type: 'llm-text', isComplete: true },
    ];

    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in conversation' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in conversation input' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('1/3')).toBeInTheDocument();

    let lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.findQuery).toBe('alpha');
    expect(lastMessageListProps.messageFindMatchIndexesById).toEqual({
      'assistant-1': [2],
      'user-1': [0, 1],
    });
    expect(lastMessageListProps.activeFindMatchIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(2);
  });

  test('closing the find bar clears the active query and match props', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Alpha beta alpha' },
    ];

    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in conversation' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in conversation input' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close find in conversation' }));

    expect(screen.queryByRole('search', { name: 'Find in conversation' })).not.toBeInTheDocument();
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.findQuery).toBe('');
    expect(lastMessageListProps.messageFindMatchIndexesById).toEqual({});
    expect(lastMessageListProps.activeFindMatchIndex).toBeNull();
  });

  test('clicking the active find button closes and clears the find bar', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Alpha beta alpha' },
    ];

    render(<ChatInterface />);

    const findButton = screen.getByRole('button', { name: 'Find in conversation' });
    fireEvent.click(findButton);
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in conversation input' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(findButton);

    expect(screen.queryByRole('search', { name: 'Find in conversation' })).not.toBeInTheDocument();
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.findQuery).toBe('');
    expect(lastMessageListProps.messageFindMatchIndexesById).toEqual({});
    expect(lastMessageListProps.activeFindMatchIndex).toBeNull();
  });
});
