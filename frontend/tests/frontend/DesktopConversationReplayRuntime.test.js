/**
 * Covers desktop conversation replay runtime behavior through its public entrypoint.
 */

import {
  DesktopConversationReplayRuntime,
} from '../../src/renderer/app/runtime/desktopConversationReplayRuntime';
import {
  DesktopConversationContinuityService,
} from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import {
  DesktopTranscriptSessionRuntimeClient,
} from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  DesktopWorkspaceRuntimeClient,
} from '../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

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
    getActiveConversationRef: jest.fn(() => 'conv-replay'),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: 'conv-replay',
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

jest.mock('../../src/renderer/app/runtime/desktopRendererTraceRuntime', () => ({
  DesktopRendererTraceRuntime: {
    logRendererReplayTrace: jest.fn(),
  },
}));

const {
  DesktopRendererTraceRuntime,
} = require('../../src/renderer/app/runtime/desktopRendererTraceRuntime');

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
  const { chatStore } = overrides.chatStoreBundle || createChatStore();
  return {
    chatStore,
    deferredQueryModelSelection: null,
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
      userMessageId: 'view-user-2',
      editedText: ' edited prompt ',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'view-user-2',
      text: 'edited prompt',
    }));
    expect(DesktopConversationContinuityService.editAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(chatStoreBundle.state.clearPendingTurn).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.setMessages).not.toHaveBeenCalled();
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

  test('replay traces consume sanitized ConversationView read model', async () => {
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
      assistantMessageId: 'view-assistant',
      chatStoreBundle,
    }))).resolves.toBe(true);

    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_start',
      conversationRef: 'conv-replay',
      currentTurnRef: 'turn-view',
      currentTurnPhase: 'complete',
      messageCount: 0,
      displayRowCount: 2,
    }));
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
      assistantMessageId: 'assistant-2',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'assistant-2',
    }));
    expect(DesktopConversationContinuityService.retryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(chatStoreBundle.state.clearPendingTurn).not.toHaveBeenCalled();
    expect(chatStoreBundle.state.setMessages).not.toHaveBeenCalled();
  });

  test('returns undefined for empty replay targets without dispatching SDK commands', async () => {
    const chatStoreBundle = createChatStore();

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      chatStoreBundle,
      messages: [{ id: 'assistant-1', sender: 'assistant', text: 'orphan answer' }],
      assistantMessageId: ' ',
    }))).resolves.toBeUndefined();

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
  });

  test('does not create a conversation when replay has no active scope', async () => {
    const chatStoreBundle = createChatStore();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    chatStoreBundle.state.activeConversationRef = null;
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      assistantMessageId: 'assistant-1',
      chatStoreBundle,
      sessionInfo: {
        conversationRef: null,
        userId: 'user-1',
      },
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      targetUserMessageId: 'assistant-1',
    }));
    errorSpy.mockRestore();
  });
});
