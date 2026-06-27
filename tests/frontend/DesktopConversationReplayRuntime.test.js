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
  DesktopTranscriptSessionRuntimeClient,
} from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
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

jest.mock('../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime', () => ({
  DesktopRendererTraceRuntime: {
    logRendererReplayTrace: jest.fn(),
  },
}));

const {
  DesktopRendererTraceRuntime,
} = require('../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime');

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

function createChatStore() {
  const state = {
    activeConversationRef: 'conv-replay',
    clearPendingTurn: jest.fn(),
    getWorkspaceState: jest.fn(() => ({
      messages: [],
      pendingTurn: null,
      sdkLiveTurn: null,
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
  const chatStoreBundle = overrides.chatStoreBundle || createChatStore();
  const { chatStore } = chatStoreBundle;
  return {
    chatStore,
    messages: [],
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exposes only the replay-action entrypoint', () => {
    expect(Object.keys(DesktopConversationReplayRuntime)).toEqual(['executeReplayAction']);
  });

  test('edits through SDK command without publishing renderer replay rows', async () => {
    const chatStoreBundle = createChatStore();
    const staleMessages = [
      { id: 'stale-user', sender: 'user', text: 'stale prompt' },
      { id: 'stale-assistant', sender: 'assistant', text: 'stale answer' },
    ];

    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      chatStoreBundle,
      messages: staleMessages,
      targetRowId: 'view-user-2',
      editedText: ' edited prompt ',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'view-user-2',
      text: ' edited prompt ',
    }));
    expect(DesktopConversationContinuityService.editAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(chatStoreBundle.state.clearPendingTurn).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.setMessages).not.toHaveBeenCalled();
  });

  test('does not use chat-store active conversation as replay command scope', async () => {
    const chatStoreBundle = createChatStore();
    chatStoreBundle.state.activeConversationRef = 'conv-store-active';
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });
    const messages = [
      { id: 'user-1', sender: 'user', text: 'retry this', turnRef: 'turn-old' },
      { id: 'assistant-1', sender: 'assistant', text: 'answer', turnRef: 'turn-old' },
    ];

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
      chatStoreBundle,
      messages,
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.getWorkspaceState).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('does not repair padded replay conversation refs before SDK dispatch', async () => {
    const chatStoreBundle = createChatStore();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    chatStoreBundle.state.activeConversationRef = ' conv-store-active ';
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(' conv-transcript ');
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: ' conv-session ',
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
      chatStoreBundle,
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      targetRowId: 'assistant-1',
    }));
    errorSpy.mockRestore();
  });

  test('ignores caller-provided active conversation overrides for replay scope', async () => {
    const chatStoreBundle = createChatStore();
    chatStoreBundle.state.activeConversationRef = 'conv-store-active';
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-session',
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
      chatStoreBundle,
      activeConversationRef: 'conv-caller-override',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-session',
      messageId: 'assistant-1',
    }));
    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-caller-override',
    }));
    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-store-active',
    }));
  });

  test('replay traces do not read projected workspace state', async () => {
    const chatStoreBundle = createChatStore();
    chatStoreBundle.state.getWorkspaceState.mockReturnValue({
      messages: [
        { id: 'stale-user', sender: 'user', text: 'raw prompt' },
        { id: 'stale-assistant', sender: 'assistant', text: 'raw answer' },
      ],
      pendingTurn: {
        conversationRef: 'conv-replay',
        turnRef: 'turn-pending',
      },
      sdkLiveTurn: {
        conversationRef: 'conv-replay',
        turnRef: 'turn-raw',
        phase: 'streaming',
      },
      conversationView: {
        conversationRef: 'conv-replay',
        displayRows: [
          { id: 'view-user', role: 'user' },
          { id: 'view-assistant', role: 'assistant' },
        ],
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'complete',
        },
      },
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'view-assistant',
      chatStoreBundle,
    }))).resolves.toBe(true);

    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_start',
      conversationRef: 'conv-replay',
      targetRowId: 'view-assistant',
    }));
    expect(chatStoreBundle.state.getWorkspaceState).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).not.toHaveBeenCalledWith(expect.objectContaining({
      currentTurnRef: 'turn-raw',
      messageCount: 2,
    }));
  });

  test('retries through SDK command without resolving previous user rows in the renderer', async () => {
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
      targetRowId: 'assistant-2',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'assistant-2',
    }));
    expect(DesktopConversationContinuityService.retryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(chatStoreBundle.state.clearPendingTurn).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.setMessages).not.toHaveBeenCalled();
  });

  test('passes blank edit text to the SDK replay command', async () => {
    const chatStoreBundle = createChatStore();

    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      chatStoreBundle,
      targetRowId: 'view-user-blank',
      editedText: '   ',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'view-user-blank',
      text: '   ',
    }));
    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
  });

  test('resolves replay session behind the runtime boundary without forwarding model overrides', async () => {
    const chatStoreBundle = createChatStore();
    const callerModel = {
      modelProvider: 'caller-provider',
      modelId: 'caller-model',
    };
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-runtime-session',
      userId: 'user-runtime',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-runtime',
      chatStoreBundle,
      sessionInfo: {
        conversationRef: 'conv-caller-session',
        userId: 'user-caller',
      },
      model: callerModel,
    }))).resolves.toBe(true);

    const replayCommand = DesktopConversationContinuityService.retryTurn.mock.calls[0][0];
    expect(replayCommand).toEqual(expect.objectContaining({
      conversationRef: 'conv-replay',
      userId: 'user-runtime',
      messageId: 'assistant-runtime',
    }));
    expect(replayCommand).not.toEqual(expect.objectContaining({
      conversationRef: 'conv-caller-session',
      userId: 'user-caller',
    }));
    expect(replayCommand).not.toHaveProperty('model');
  });

  test('returns undefined for empty replay row targets without dispatching SDK commands', async () => {
    const chatStoreBundle = createChatStore();

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      chatStoreBundle,
      messages: [{ id: 'assistant-1', sender: 'assistant', text: 'orphan answer' }],
      targetRowId: ' ',
    }))).resolves.toBeUndefined();

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
  });

  test('returns undefined for padded replay row targets without dispatching SDK commands', async () => {
    const chatStoreBundle = createChatStore();

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      chatStoreBundle,
      targetRowId: ' assistant-1 ',
    }))).resolves.toBeUndefined();
    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      chatStoreBundle,
      targetRowId: ' user-1 ',
      editedText: 'edited question',
    }))).resolves.toBeUndefined();

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
  });

  test('does not create a conversation when replay has no active scope', async () => {
    const chatStoreBundle = createChatStore();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    chatStoreBundle.state.activeConversationRef = null;
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
      chatStoreBundle,
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      targetRowId: 'assistant-1',
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).not.toHaveBeenCalledWith(expect.objectContaining({
      targetUserMessageId: expect.any(String),
    }));
    errorSpy.mockRestore();
  });
});
