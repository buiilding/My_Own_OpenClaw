/**
 * Covers desktop conversation replay runtime behavior through its public entrypoint.
 */

import {
  DesktopConversationReplayRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime';
import {
  DesktopConversationContinuityService,
} from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
import {
  DesktopPendingTurnRuntimeClient,
} from '../../frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient';
import {
  DesktopTranscriptSessionRuntimeClient,
} from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  DesktopWorkspaceRuntimeClient,
} from '../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
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

jest.mock('../../frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient', () => ({
  DesktopPendingTurnRuntimeClient: {
    setPending: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => 'conv-replay'),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: 'conv-replay',
      userId: 'user-1',
    })),
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    getConversationWorkspaceBinding: jest.fn(() => ({ workspacePath: null })),
    setConversationWorkspaceBinding: jest.fn(),
  },
}));

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

function displayRowsFromMessages(messages, conversationRef = 'conv-replay', revisionId = 'rev-view') {
  return messages.map((message, index) => ({
    id: message.id,
    conversationRef,
    revisionId,
    index,
    role: message.sender === 'user' ? 'user' : 'assistant',
    type: message.sender === 'user' ? 'user_message' : 'assistant_message',
    content: message.text,
    ...(message.turnRef ? { turnRef: message.turnRef } : {}),
    metadata: {
      revisionId,
      ...(Array.isArray(message.attachments) ? { attachments: message.attachments } : {}),
    },
  }));
}

function createChatStore() {
  const state = {
    acceptReplayPendingTurn: jest.fn(),
    activeConversationRef: 'conv-replay',
    addMessage: jest.fn(),
    clearPendingTurn: jest.fn(),
    getWorkspaceState: jest.fn(() => ({
      messages: [],
      pendingTurn: null,
      currentTurnProjection: null,
      conversationView: null,
    })),
    setMessages: jest.fn(),
  };
  return {
    state,
    chatStore: {
      getState: jest.fn(() => state),
    },
  };
}

function replayArgs(overrides = {}) {
  const { chatStore } = overrides.chatStoreBundle || createChatStore();
  return {
    chatStore,
    deferredQueryModelSelection: null,
    failureMessages: {
      sendFailureMessage: 'send failed',
      replayPreparationFailureMessage: 'prepare failed',
    },
    messages: [],
    sessionInfo: {
      conversationRef: 'conv-replay',
      userId: 'user-1',
    },
    ...overrides,
  };
}

describe('desktopConversationReplayRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-replay');
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue('conv-replay');
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-replay',
      userId: 'user-1',
    });
    DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding.mockReturnValue({ workspacePath: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exposes only the replay-action entrypoint', () => {
    expect(Object.keys(DesktopConversationReplayRuntime)).toEqual(['executeReplayAction']);
  });

  test('edits from ConversationView rows before stale renderer messages', async () => {
    const chatStoreBundle = createChatStore();
    const staleMessages = [
      { id: 'stale-user', sender: 'user', text: 'stale prompt' },
      { id: 'stale-assistant', sender: 'assistant', text: 'stale answer' },
    ];
    const viewMessages = [
      { id: 'view-user-1', sender: 'user', text: 'view prompt', turnRef: 'turn-view-1' },
      { id: 'view-assistant-1', sender: 'assistant', text: 'view answer', turnRef: 'turn-view-1' },
      { id: 'view-user-2', sender: 'user', text: 'second prompt', turnRef: 'turn-view-2' },
      { id: 'view-assistant-2', sender: 'assistant', text: 'second answer', turnRef: 'turn-view-2' },
    ];

    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      chatStoreBundle,
      conversationView: {
        conversationRef: 'conv-replay',
        displayRows: displayRowsFromMessages(viewMessages),
      },
      messages: staleMessages,
      userMessageId: 'view-user-2',
      editedText: ' edited prompt ',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'view-user-2',
      text: 'edited prompt',
      turnRef: 'turn-replay',
    }));
    expect(chatStoreBundle.state.acceptReplayPendingTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      pendingTurn: expect.objectContaining({
        text: 'edited prompt',
        turnRef: 'turn-replay',
        userMessageId: 'turn-replay-sdk-evt-000002-user_message',
      }),
      messages: [
        expect.objectContaining({ id: 'view-user-1' }),
        expect.objectContaining({ id: 'view-assistant-1' }),
        expect.objectContaining({
          id: 'turn-replay-sdk-evt-000002-user_message',
          text: 'edited prompt',
          turnRef: 'turn-replay',
        }),
      ],
      supersededTurnRef: 'turn-view-2',
    }));
    expect(DesktopPendingTurnRuntimeClient.setPending).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-replay',
      text: 'edited prompt',
    }));
  });

  test('resolves active conversation ref from the store dependency', async () => {
    const chatStoreBundle = createChatStore();
    chatStoreBundle.state.activeConversationRef = 'conv-store-active';
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    const messages = [
      { id: 'user-1', sender: 'user', text: 'retry this', turnRef: 'turn-old' },
      { id: 'assistant-1', sender: 'assistant', text: 'answer', turnRef: 'turn-old' },
    ];

    await expect(executeReplayAction(replayArgs({
      activeConversationRef: undefined,
      action: 'retry',
      assistantMessageId: 'assistant-1',
      chatStoreBundle,
      messages,
      sessionInfo: {
        conversationRef: null,
        userId: 'user-1',
      },
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-store-active',
      messageId: 'assistant-1',
      userId: 'user-1',
    }));
  });

  test('retries through SDK command with retained visible prefix', async () => {
    const chatStoreBundle = createChatStore();
    const messages = [
      { id: 'user-1', sender: 'user', type: 'user', text: 'first' },
      { id: 'tool-call-1', sender: 'assistant', type: 'tool-call', correlationId: 'corr-1' },
      { id: 'tool-output-1', sender: 'assistant', type: 'tool-output', correlationId: 'corr-1' },
      { id: 'tool-call-orphan', sender: 'assistant', type: 'tool-call', correlationId: 'orphan' },
      { id: 'assistant-1', sender: 'assistant', type: 'llm-text', text: 'first answer' },
      { id: 'user-2', sender: 'user', type: 'user', text: 'retry this', turnRef: 'turn-old' },
      { id: 'assistant-2', sender: 'assistant', type: 'llm-text', text: 'second answer' },
    ];

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      chatStoreBundle,
      messages,
      assistantMessageId: 'assistant-2',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'assistant-2',
      turnRef: 'turn-replay',
    }));
    expect(chatStoreBundle.state.acceptReplayPendingTurn.mock.calls[0][0].messages.map((message) => message.id)).toEqual([
      'user-1',
      'tool-call-1',
      'tool-output-1',
      'tool-call-orphan',
      'assistant-1',
      'turn-replay-sdk-evt-000002-user_message',
    ]);
    expect(chatStoreBundle.state.acceptReplayPendingTurn).toHaveBeenCalledWith(expect.objectContaining({
      pendingTurn: expect.objectContaining({
        text: 'retry this',
        turnRef: 'turn-replay',
      }),
      supersededTurnRef: 'turn-old',
    }));
  });

  test('returns undefined for missing replay targets without dispatching SDK commands', async () => {
    const chatStoreBundle = createChatStore();

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      chatStoreBundle,
      messages: [{ id: 'assistant-1', sender: 'assistant', text: 'orphan answer' }],
      assistantMessageId: 'assistant-1',
    }))).resolves.toBeUndefined();

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.acceptReplayPendingTurn).not.toHaveBeenCalled();
    expect(DesktopPendingTurnRuntimeClient.setPending).not.toHaveBeenCalled();
  });
});
