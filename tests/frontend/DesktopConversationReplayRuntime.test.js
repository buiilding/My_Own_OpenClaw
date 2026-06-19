/**
 * Covers desktop conversation replay runtime behavior in the frontend test suite.
 */

import {
  buildPreparedReplayDesktopChatTurn,
  buildReplayContextMessages,
  buildReplayPreparationPayload,
  findReplayEditableUserMessageIndex,
  resolveReplayRetryMessageIndexes,
} from '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime';

describe('desktopConversationReplayRuntime', () => {
  test('findReplayEditableUserMessageIndex only selects matching user rows', () => {
    const messages = [
      { id: 'assistant-1', sender: 'assistant' },
      { id: 'user-1', sender: 'user' },
      { id: 'assistant-user-id', sender: 'assistant' },
    ];

    expect(findReplayEditableUserMessageIndex(messages, 'user-1')).toBe(1);
    expect(findReplayEditableUserMessageIndex(messages, 'assistant-user-id')).toBe(-1);
    expect(findReplayEditableUserMessageIndex(messages, 'missing')).toBe(-1);
  });

  test('resolveReplayRetryMessageIndexes selects the prior user for an assistant retry', () => {
    const messages = [
      { id: 'user-1', sender: 'user' },
      { id: 'assistant-1', sender: 'assistant' },
      { id: 'tool-1', sender: 'assistant', type: 'tool-output' },
      { id: 'assistant-2', sender: 'assistant' },
    ];

    expect(resolveReplayRetryMessageIndexes(messages, 'assistant-2')).toEqual({
      assistantIndex: 3,
      userIndex: 0,
    });
    expect(resolveReplayRetryMessageIndexes(messages, 'user-1')).toEqual({
      assistantIndex: -1,
      userIndex: -1,
    });
    expect(resolveReplayRetryMessageIndexes([{ id: 'assistant-1', sender: 'assistant' }], 'assistant-1')).toEqual({
      assistantIndex: 0,
      userIndex: -1,
    });
  });

  test('keeps non-tool rows and matched tool call/output pairs', () => {
    const messages = [
      { id: 'm-1', type: 'llm-text', text: 'assistant intro' },
      { id: 'm-2', type: 'tool-call', correlationId: 'corr-1' },
      { id: 'm-3', type: 'tool-output', correlationId: 'corr-1' },
      { id: 'm-4', type: 'llm-text', text: 'assistant summary' },
      { id: 'm-5', type: 'tool-call', correlationId: 'corr-orphan' },
      { id: 'm-6', type: 'tool-output', correlationId: 'corr-missing-call' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
    ]);
  });

  test('matches output with idless pending tool call when id-specific match is missing', () => {
    const messages = [
      { id: 'm-1', type: 'tool-call', correlationId: '   ' },
      { id: 'm-2', type: 'tool-output', correlationId: 'corr-no-match' },
      { id: 'm-3', type: 'llm-text', text: 'tail' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
    ]);
  });

  test('drops an idless output instead of pairing it with identified pending calls', () => {
    const messages = [
      { id: 'm-1', type: 'tool-call', correlationId: 'corr-a' },
      { id: 'm-2', type: 'tool-call', correlationId: 'corr-b' },
      { id: 'm-3', type: 'tool-output', correlationId: '   ' },
      { id: 'm-4', type: 'llm-text', text: 'tail' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-4',
    ]);
  });

  test('matches idless outputs with idless pending tool calls', () => {
    const messages = [
      { id: 'm-1', type: 'tool-call', correlationId: '   ' },
      { id: 'm-2', type: 'tool-output', correlationId: '   ' },
      { id: 'm-3', type: 'llm-text', text: 'tail' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
    ]);
  });

  test('matches calls and outputs when only payload/model-facing correlation ids are present', () => {
    const messages = [
      {
        id: 'm-1',
        type: 'tool-call',
        correlationId: '   ',
        toolCallDetails: { request_id: ' req-a ' },
      },
      {
        id: 'm-2',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { request_id: 'req-a' },
      },
      {
        id: 'm-3',
        type: 'tool-call',
        correlationId: '   ',
        modelFacingToolCall: { id: 'tool-call-model' },
      },
      {
        id: 'm-4',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { request_id: 'tool-call-model' },
      },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
    ]);
  });

  test('matches calls and outputs with provider-safe tool call id only', () => {
    const messages = [
      {
        id: 'm-1',
        type: 'tool-call',
        correlationId: '   ',
        toolCallDetails: { tool_call_id: ' call-a ' },
      },
      {
        id: 'm-2',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { tool_call_id: 'call-a' },
      },
      {
        id: 'm-3',
        type: 'tool-call',
        correlationId: '   ',
        toolCallDetails: { bundle_id: ' bundle-a ' },
      },
      {
        id: 'm-4',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { bundle_id: 'bundle-a' },
      },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
    ]);
  });

  test('buildReplayPreparationPayload preserves only remote screenshot metadata', () => {
    expect(buildReplayPreparationPayload({
      screenshotRef: 'artifact-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
    })).toEqual({
      screenshot_ref: 'artifact-1',
      screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
    });
    expect(buildReplayPreparationPayload({
      screenshotRef: null,
      screenshotUrl: null,
    })).toEqual({});
  });

  test('buildPreparedReplayDesktopChatTurn normalizes prepared replay payload fields', () => {
    const preparedTurn = {
      conversationRef: 'conv-prepared',
      model: null,
      payload: {
        screenshot_ref: 'artifact-primary',
        screenshot_refs: ['artifact-primary', 'artifact-secondary'],
        screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-primary',
        attachment_filenames: [' one.png ', '', 'two.png'],
      },
      text: 'retry this',
      turnRef: null,
      workspacePath: null,
    };

    expect(buildPreparedReplayDesktopChatTurn({
      preparedReplayTurn: preparedTurn,
      conversationRef: 'conv-fallback',
      deferredQueryModelSelection: { modelProvider: 'openai', modelId: 'gpt-5' },
      screenshotRef: 'artifact-fallback',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-fallback',
      sessionInfo: { conversationRef: 'conv-prepared', userId: 'user-1' },
      workspacePath: 'C:/workspace',
      createTurnRef: () => 'turn-runtime',
      timestamp: () => '2026-06-19T00:00:00.000Z',
    })).toEqual({
      attachmentFilenames: ['one.png', 'two.png'],
      conversationRef: 'conv-prepared',
      deferredQueryModelSelection: null,
      metadata: null,
      model: { modelProvider: 'openai', modelId: 'gpt-5' },
      resources: [],
      screenshotRef: 'artifact-primary',
      screenshotRefs: ['artifact-primary', 'artifact-secondary'],
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-primary',
      sendLifecycle: {
        shouldCaptureQueryScreenshot: false,
        shouldReturnToChatboxOnSend: false,
        surfaceReason: 'replay',
      },
      sessionInfo: { conversationRef: 'conv-prepared', userId: 'user-1' },
      text: 'retry this',
      timestamp: '2026-06-19T00:00:00.000Z',
      turnId: 'turn-runtime',
      turnRef: 'turn-runtime',
      workspacePath: 'C:/workspace',
    });
  });
});
