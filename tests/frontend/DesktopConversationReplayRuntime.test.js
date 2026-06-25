/**
 * Covers desktop conversation replay runtime behavior in the frontend test suite.
 */

import {
  DesktopConversationReplayRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime';

const {
  buildReplayPendingTurn,
  buildReplayPendingPublication,
  buildReplayContextMessages,
  findReplayEditableUserMessageIndex,
  prepareReplayEditIntent,
  prepareReplayRetryIntent,
  resolveReplayRetryMessageIndexes,
} = DesktopConversationReplayRuntime;

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

  test('buildReplayPendingTurn keeps replay pending row identity stable', () => {
    expect(buildReplayPendingTurn({
      attachmentFilenames: ['one.png'],
      conversationRef: 'conv-replay',
      turnRef: 'turn-replay',
      userMessageId: 'renderer-user-1',
      text: 'retry this',
      timestamp: '2026-06-21T00:00:00.000Z',
    })).toEqual({
      attachmentFilenames: ['one.png'],
      conversationRef: 'conv-replay',
      turnRef: 'turn-replay',
      userMessageId: 'renderer-user-1',
      text: 'retry this',
      timestamp: '2026-06-21T00:00:00.000Z',
    });

    expect(buildReplayPendingTurn({
      conversationRef: 'conv-replay',
      turnRef: 'turn-fallback',
      text: 'retry this',
      timestamp: '2026-06-21T00:00:00.000Z',
    })).toMatchObject({
      attachmentFilenames: null,
      userMessageId: 'turn-fallback-sdk-evt-000002-user_message',
    });
  });

  test('buildReplayPendingPublication returns pending bridge state and superseded turn', () => {
    const replayMessages = [
      { id: 'user-old', sender: 'user', text: 'old' },
    ];
    const publication = buildReplayPendingPublication({
      conversationRef: 'conv-replay',
      replayMessages,
      sourceUserMessage: {
        turnRef: 'turn-old',
        attachmentFilenames: ['shot.png'],
      },
      turnRef: 'turn-new',
      text: 'retry this',
      timestamp: '2026-06-21T00:00:00.000Z',
    });

    expect(publication).toEqual({
      pendingTurn: expect.objectContaining({
        attachmentFilenames: ['shot.png'],
        conversationRef: 'conv-replay',
        text: 'retry this',
        turnRef: 'turn-new',
      }),
      messages: [
        replayMessages[0],
        expect.objectContaining({
          id: 'turn-new-sdk-evt-000002-user_message',
          sender: 'user',
          text: 'retry this',
          turnRef: 'turn-new',
        }),
      ],
      supersededTurnRef: 'turn-old',
    });
  });

  test('prepareReplayEditIntent returns SDK command intent and retained context', () => {
    const intent = prepareReplayEditIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'first' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply' },
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
        { id: 'assistant-2', sender: 'assistant', text: 'reply 2' },
      ],
      userMessageId: 'user-2',
      editedText: ' edited second ',
    });

    expect(intent).toEqual(expect.objectContaining({
      action: 'edit_resend',
      errorPrefix: 'Failed to edit user message',
      messageId: 'user-2',
      queryText: 'edited second',
      targetUserMessageId: 'user-2',
      sourceUserMessage: expect.objectContaining({
        id: 'user-2',
        text: 'edited second',
        turnRef: 'turn-2',
      }),
    }));
    expect(intent.replayMessages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(prepareReplayEditIntent({
      messages: [],
      userMessageId: 'missing',
      editedText: 'text',
    })).toBeNull();
    expect(prepareReplayEditIntent({
      messages: [{ id: 'user-1', sender: 'user' }],
      userMessageId: 'user-1',
      editedText: '   ',
    })).toBeNull();
  });

  test('prepareReplayRetryIntent returns SDK command intent for the prior user row', () => {
    const intent = prepareReplayRetryIntent({
      messages: [
        { id: 'user-1', sender: 'user', text: 'first' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply' },
        { id: 'user-2', sender: 'user', text: 'second', turnRef: 'turn-2' },
        { id: 'assistant-2', sender: 'assistant', text: 'reply 2' },
      ],
      assistantMessageId: 'assistant-2',
    });

    expect(intent).toEqual(expect.objectContaining({
      action: 'retry',
      errorPrefix: 'Failed to retry assistant message',
      messageId: 'assistant-2',
      queryText: 'second',
      targetUserMessageId: 'user-2',
      sourceUserMessage: expect.objectContaining({
        id: 'user-2',
        text: 'second',
        turnRef: 'turn-2',
      }),
    }));
    expect(intent.replayMessages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(prepareReplayRetryIntent({
      messages: [{ id: 'assistant-1', sender: 'assistant' }],
      assistantMessageId: 'assistant-1',
    })).toBeNull();
  });
});
