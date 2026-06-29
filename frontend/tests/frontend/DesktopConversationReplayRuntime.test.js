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

function replayArgs(overrides = {}) {
  const args = {
    action: overrides.action,
    conversationRef: overrides.conversationRef ?? null,
    targetRowId: overrides.targetRowId ?? null,
  };
  if (Object.prototype.hasOwnProperty.call(overrides, 'editedText')) {
    args.editedText = overrides.editedText;
  }
  return args;
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
    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      targetRowId: 'view-user-2',
      editedText: ' edited prompt ',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'view-user-2',
      text: ' edited prompt ',
    }));
    expect(DesktopConversationContinuityService.editAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(DesktopConversationContinuityService.editAndResend.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  test('does not use chat-store active conversation as replay command scope', async () => {
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('uses exact SDK row conversation scope when transcript session is empty', async () => {
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      conversationRef: 'conv-row-scope',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-row-scope',
      messageId: 'assistant-1',
      userId: 'user-1',
    }));
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith('conv-row-scope', 'user-1');
  });

  test('rejects padded SDK row conversation scope before SDK dispatch', async () => {
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      conversationRef: ' conv-row-scope ',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('does not repair padded replay conversation refs before SDK dispatch', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(' conv-transcript ');
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: ' conv-session ',
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      replayAction: 'retry',
      targetRowId: 'assistant-1',
    }));
    errorSpy.mockRestore();
  });

  test('rejects caller-provided active conversation overrides before SDK dispatch', async () => {
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-session',
      userId: 'user-1',
    });

    await expect(executeReplayAction({
      action: 'retry',
      targetRowId: 'assistant-1',
      activeConversationRef: 'conv-caller-override',
    })).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'UnknownReplayActionField',
      replayAction: null,
      targetRowId: null,
    }));
  });

  test('replay traces do not read projected workspace state', async () => {
    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'view-assistant',
    }))).resolves.toBe(true);

    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_start',
      conversationRef: 'conv-replay',
      targetRowId: 'view-assistant',
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).not.toHaveBeenCalledWith(expect.objectContaining({
      currentTurnRef: 'turn-raw',
      messageCount: 2,
    }));
  });

  test('retries through SDK command without resolving previous user rows in the renderer', async () => {
    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-2',
    }))).resolves.toBe(true);

    expect(DesktopConversationContinuityService.retryTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-replay',
      messageId: 'assistant-2',
    }));
    expect(DesktopConversationContinuityService.retryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(DesktopConversationContinuityService.retryTurn.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  test('passes blank edit text to the SDK replay command', async () => {
    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
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

  test('rejects legacy caller context and model overrides before SDK dispatch', async () => {
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-runtime-session',
      userId: 'user-runtime',
    });

    await expect(executeReplayAction({
      action: 'retry',
      targetRowId: 'assistant-runtime',
      sessionInfo: {
        conversationRef: 'conv-caller-session',
        userId: 'user-caller',
      },
      model: {
        modelProvider: 'caller-provider',
        modelId: 'caller-model',
      },
    })).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'UnknownReplayActionField',
      replayAction: null,
      targetRowId: null,
    }));
  });

  test('rejects empty replay row targets before SDK dispatch', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: ' ',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingReplayTargetRowId',
      replayAction: 'retry',
      targetRowId: null,
    }));
    errorSpy.mockRestore();
  });

  test('rejects padded replay row targets before SDK dispatch without repairing them', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: ' assistant-1 ',
    }))).resolves.toBe(false);
    await expect(executeReplayAction(replayArgs({
      action: 'edit_resend',
      targetRowId: ' user-1 ',
      editedText: 'edited question',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingReplayTargetRowId',
      replayAction: 'retry',
      targetRowId: null,
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingReplayTargetRowId',
      replayAction: 'edit_resend',
      targetRowId: null,
    }));
    errorSpy.mockRestore();
  });

  test('does not create a conversation when replay has no active scope', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    DesktopTranscriptSessionRuntimeClient.getActiveConversationRef.mockReturnValue(null);
    DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(false);

    expect(DesktopConversationContinuityService.retryTurn).not.toHaveBeenCalled();
    expect(DesktopConversationContinuityService.editAndResend).not.toHaveBeenCalled();
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).not.toHaveBeenCalled();
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      replayAction: 'retry',
      targetRowId: 'assistant-1',
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).not.toHaveBeenCalledWith(expect.objectContaining({
      targetUserMessageId: expect.any(String),
    }));
    errorSpy.mockRestore();
  });

  test('records SDK replay failures without mutating rejected SDK errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const sdkReplayError = new Error('sdk replay failed');
    sdkReplayError.name = ' SDKReplayError ';
    DesktopConversationContinuityService.retryTurn.mockRejectedValue(sdkReplayError);

    await expect(executeReplayAction(replayArgs({
      action: 'retry',
      targetRowId: 'assistant-1',
    }))).resolves.toBe(false);

    expect(sdkReplayError).not.toHaveProperty('__desktopRuntimeReplayStep');
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sdk_replay_failed',
      conversationRef: 'conv-replay',
      errorKind: 'Error',
      replayAction: 'retry',
      replaySucceeded: false,
      targetRowId: 'assistant-1',
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).toHaveBeenCalledWith(expect.objectContaining({
      action: 'replay_failed_cleanup',
      conversationRef: 'conv-replay',
      errorKind: 'Error',
      replayAction: 'retry',
      targetRowId: 'assistant-1',
    }));
    expect(DesktopRendererTraceRuntime.logRendererReplayTrace).not.toHaveBeenCalledWith(expect.objectContaining({
      errorKind: 'SDKReplayError',
    }));
    errorSpy.mockRestore();
  });
});
