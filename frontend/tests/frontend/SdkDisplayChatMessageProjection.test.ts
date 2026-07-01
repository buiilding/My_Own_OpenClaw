/**
 * Covers sdk display chat message projection. behavior in the frontend test suite.
 */

import { DesktopSdkDisplayChatMessageProjectionRuntime } from '../../src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime';

const {
  buildChatMessagesFromSdkDisplayRows,
} = DesktopSdkDisplayChatMessageProjectionRuntime;

describe('sdkDisplayChatMessageProjection', () => {
  test('projects SDK display messages into existing chat message shapes', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'open package json',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          sourceEventType: 'user_message',
        },
      },
      {
        id: 'msg-tool-call',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'tool_call',
        content: 'read_file {"path":"package.json"}',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          displayCorrelationId: 'req-1',
          toolCallId: 'call-1',
          toolCallDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            toolCallId: 'call-1',
          },
          modelFacingToolCall: {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'package.json' },
          },
        },
      },
      {
        id: 'msg-tool-output',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'tool',
        type: 'tool_output',
        content: 'package contents',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          displayCorrelationId: 'req-1',
          toolCallId: 'call-1',
          success: true,
          toolOutputDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            toolCallId: 'call-1',
            success: true,
          },
        },
      },
      {
        id: 'msg-assistant',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'assistant',
        type: 'assistant_message',
        content: 'package json is loaded',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:03.000Z',
        },
      },
    ]);

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'msg-user',
        sender: 'user',
        text: 'open package json',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
        timestamp: '2026-05-15T12:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'msg-tool-call',
        sender: 'assistant',
        type: 'tool-call',
        correlationId: 'req-1',
        text: 'read_file {"path":"package.json"}',
        toolCallDisplayText: 'read_file {"path":"package.json"}',
      }),
      expect.objectContaining({
        id: 'msg-tool-output',
        sender: 'assistant',
        type: 'tool-output',
        text: 'package contents',
        correlationId: 'req-1',
        toolOutputDetails: {
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          success: true,
        },
      }),
      expect.objectContaining({
        id: 'msg-assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'package json is loaded',
      }),
    ]);
    expect(messages[0]).not.toHaveProperty('turnRef');
    expect(messages[2]).not.toHaveProperty('modelFacingToolOutput');
  });

  test('does not recover malformed string-owned display row content in renderer projection', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-object-content',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: { text: 'renderer must not recover this' },
      },
      {
        id: 'msg-assistant-array-content',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: ['renderer must not recover this'],
      },
      {
        id: 'msg-tool-output-object-content',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'tool',
        type: 'tool_output',
        content: { output: 'renderer must not recover this' },
      },
      {
        id: 'msg-tool-call-object-content',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'renderer_must_not_recover_this',
          arguments: { path: 'package.json' },
        },
      },
      {
        id: 'msg-tool-bundle-output-object-content',
        conversationRef: 'conv-sdk',
        index: 4,
        role: 'tool',
        type: 'tool_bundle_output',
        content: {
          step_results: [{
            output: 'renderer must not recover this',
          }],
        },
      },
      {
        id: 'msg-tool-progress-object-content',
        conversationRef: 'conv-sdk',
        index: 5,
        role: 'assistant',
        type: 'tool_progress',
        content: { progress: 'renderer must not recover this' },
      },
    ] as any);

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'msg-user-object-content',
        text: '',
      }),
      expect.objectContaining({
        id: 'msg-assistant-array-content',
        text: '',
      }),
      expect.objectContaining({
        id: 'msg-tool-output-object-content',
        text: '',
      }),
      expect.objectContaining({
        id: 'msg-tool-call-object-content',
        text: '',
      }),
      expect.objectContaining({
        id: 'msg-tool-bundle-output-object-content',
        text: '',
      }),
      expect.objectContaining({
        id: 'msg-tool-progress-object-content',
        text: '',
      }),
    ]);
    expect(messages[3]).not.toHaveProperty('toolCallDisplayText');
  });

  test('drops display rows with mismatched SDK role and type pairs', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'mismatched-user-row',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'user_message',
        content: 'renderer must not make this a user row',
      },
      {
        id: 'mismatched-assistant-row',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'user',
        type: 'assistant_message',
        content: 'renderer must not make this an assistant row',
      },
      {
        id: 'mismatched-tool-call-row',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'tool',
        type: 'tool_call',
        content: 'renderer must not make this a tool call',
      },
      {
        id: 'mismatched-tool-output-row',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'assistant',
        type: 'tool_output',
        content: 'renderer must not make this a tool output',
      },
      {
        id: 'mismatched-tool-progress-row',
        conversationRef: 'conv-sdk',
        index: 4,
        role: 'tool',
        type: 'tool_progress',
        content: 'renderer must not make this tool progress',
      },
      {
        id: 'padded-user-role-row',
        conversationRef: 'conv-sdk',
        index: 5,
        role: ' user ',
        type: 'user_message',
        content: 'renderer must not repair this role',
      },
      {
        id: 'padded-user-type-row',
        conversationRef: 'conv-sdk',
        index: 6,
        role: 'user',
        type: ' user_message ',
        content: 'renderer must not repair this type',
      },
      {
        id: 'unknown-row-type',
        conversationRef: 'conv-sdk',
        index: 7,
        role: 'assistant',
        type: 'assistant_delta',
        content: 'renderer must not map unknown row types',
      },
    ] as any)).toEqual([]);
  });

  test('keeps SDK-declared string tool display rows visible', () => {
    const [toolCall, toolBundleOutput] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-string-content',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: 'read_file {"path":"package.json"}',
      },
      {
        id: 'msg-tool-bundle-output-string-content',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'tool',
        type: 'tool_bundle_output',
        content: 'bundle output: package contents',
      },
    ]);

    expect(toolCall).toEqual(expect.objectContaining({
      id: 'msg-tool-call-string-content',
      text: 'read_file {"path":"package.json"}',
      toolCallDisplayText: 'read_file {"path":"package.json"}',
    }));
    expect(toolBundleOutput).toEqual(expect.objectContaining({
      id: 'msg-tool-bundle-output-string-content',
      text: 'bundle output: package contents',
    }));
  });

  test('omits missing or malformed SDK source event types', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-padded-source',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
        metadata: {
          sourceEventType: ' user_message_metadata ',
        },
      },
      {
        id: 'msg-assistant-source',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi',
        metadata: {
          sourceEventType: 'assistant_delta',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'msg-user-padded-source',
      }),
      expect.objectContaining({
        id: 'msg-assistant-source',
        sourceEventType: 'assistant_delta',
      }),
    ]);
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-without-source',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      },
      {
        id: 'msg-tool-progress-without-source',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
      },
    ])).toEqual([
      expect.not.objectContaining({ sourceEventType: expect.anything() }),
      expect.not.objectContaining({ sourceEventType: expect.anything() }),
    ]);
  });

  test('does not expose padded display row timestamps as renderer metadata', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-padded-timestamp',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
        metadata: {
          timestamp: ' 2026-05-15T12:00:00.000Z ',
        },
      },
      {
        id: 'msg-assistant-padded-timestamp',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi',
        metadata: {
          timestamp: ' 2026-05-15T12:00:00.000Z ',
        },
      },
      {
        id: 'msg-tool-call-padded-timestamp',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'assistant',
        type: 'tool_call',
        content: 'read_file {"path":"package.json"}',
        metadata: {
          timestamp: ' 2026-05-15T12:00:00.000Z ',
        },
      },
      {
        id: 'msg-tool-output-padded-timestamp',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          timestamp: ' 2026-05-15T12:00:00.000Z ',
        },
      },
      {
        id: 'msg-tool-progress-exact-timestamp',
        conversationRef: 'conv-sdk',
        index: 4,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
        metadata: {
          timestamp: '2026-05-15T12:00:00.000Z',
        },
      },
    ]);

    for (const message of messages.slice(0, 4)) {
      expect(message).not.toHaveProperty('timestamp');
    }
    expect(messages).toEqual([
      expect.not.objectContaining({ timestamp: ' 2026-05-15T12:00:00.000Z ' }),
      expect.not.objectContaining({ timestamp: ' 2026-05-15T12:00:00.000Z ' }),
      expect.not.objectContaining({ timestamp: ' 2026-05-15T12:00:00.000Z ' }),
      expect.not.objectContaining({ timestamp: ' 2026-05-15T12:00:00.000Z ' }),
      expect.objectContaining({ timestamp: '2026-05-15T12:00:00.000Z' }),
    ]);
    expect(messages.slice(0, 4)).toEqual([
      expect.not.objectContaining({ timestamp: '2026-05-15T12:00:00.000Z' }),
      expect.not.objectContaining({ timestamp: '2026-05-15T12:00:00.000Z' }),
      expect.not.objectContaining({ timestamp: '2026-05-15T12:00:00.000Z' }),
      expect.not.objectContaining({ timestamp: '2026-05-15T12:00:00.000Z' }),
    ]);
  });

  test('omits display row timestamp metadata when SDK does not provide one', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-without-timestamp',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      },
      {
        id: 'msg-assistant-without-timestamp',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi',
      },
      {
        id: 'msg-tool-progress-without-timestamp',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
      },
    ]);

    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message).not.toHaveProperty('timestamp');
    }
  });

  test('drops display rows with malformed SDK row ids', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: ' msg-user-padded-id ',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      },
      {
        id: '',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi',
      },
      {
        id: { value: 'msg-tool-call-object-id' },
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'assistant',
        type: 'tool_call',
        content: 'read_file {"path":"package.json"}',
      },
      {
        id: 'msg-tool-output-exact-id',
        conversationRef: 'conv-sdk',
        index: 3,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
      },
    ] as any)).toEqual([
      expect.objectContaining({ id: 'msg-tool-output-exact-id' }),
    ]);
  });

  test('does not expose padded display correlation ids as renderer tool identity', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-padded-correlation',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: { name: 'read_file' },
        metadata: {
          displayCorrelationId: ' req-1 ',
        },
      },
      {
        id: 'msg-tool-output-padded-correlation',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          displayCorrelationId: ' req-1 ',
        },
      },
      {
        id: 'msg-tool-progress-padded-correlation',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
        metadata: {
          displayCorrelationId: ' req-1 ',
        },
      },
    ]);

    expect(messages).toEqual([
      expect.not.objectContaining({ correlationId: ' req-1 ' }),
      expect.not.objectContaining({ correlationId: ' req-1 ' }),
      expect.not.objectContaining({ correlationId: ' req-1 ' }),
    ]);
    expect(messages).toEqual([
      expect.not.objectContaining({ correlationId: 'req-1' }),
      expect.not.objectContaining({ correlationId: 'req-1' }),
      expect.not.objectContaining({ correlationId: 'req-1' }),
    ]);
    for (const message of messages) {
      expect(message).not.toHaveProperty('correlationId');
    }
  });

  test('preserves user row turn refs so replay pending rows dedupe after SDK projection', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'turn-replay-sdk-evt-000002-user_message',
        conversationRef: 'conv-sdk',
        turnRef: 'turn-replay',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'edited prompt',
        metadata: {
          revisionId: 'rev-child',
          timestamp: '2026-05-15T12:00:00.000Z',
          sourceEventType: 'user_message',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'turn-replay-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'edited prompt',
        turnRef: 'turn-replay',
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
      }),
    ]);
  });

  test('does not expose padded display row turn refs as renderer identity', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-padded-turn',
        conversationRef: 'conv-sdk',
        turnRef: ' turn-1 ',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      },
      {
        id: 'msg-assistant-padded-turn',
        conversationRef: 'conv-sdk',
        turnRef: ' turn-1 ',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'hi',
      },
      {
        id: 'msg-tool-call-padded-turn',
        conversationRef: 'conv-sdk',
        turnRef: ' turn-1 ',
        index: 2,
        role: 'assistant',
        type: 'tool_call',
        content: { name: 'read_file' },
      },
      {
        id: 'msg-tool-output-padded-turn',
        conversationRef: 'conv-sdk',
        turnRef: ' turn-1 ',
        index: 3,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
      },
      {
        id: 'msg-tool-progress-padded-turn',
        conversationRef: 'conv-sdk',
        turnRef: ' turn-1 ',
        index: 4,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
      },
    ]);

    expect(messages.map((message) => message.id)).toEqual([
      'msg-user-padded-turn',
      'msg-assistant-padded-turn',
      'msg-tool-call-padded-turn',
      'msg-tool-output-padded-turn',
      'msg-tool-progress-padded-turn',
    ]);
    for (const message of messages) {
      expect(message).not.toHaveProperty('turnRef');
      expect(message).not.toEqual(expect.objectContaining({ turnRef: ' turn-1 ' }));
      expect(message).not.toEqual(expect.objectContaining({ turnRef: 'turn-1' }));
    }
  });

  test('omits display row identity props when SDK does not provide exact values', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-without-turn',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'hello',
      },
      {
        id: 'msg-tool-progress-without-identity',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).not.toHaveProperty('turnRef');
    expect(messages[1]).not.toHaveProperty('turnRef');
    expect(messages[1]).not.toHaveProperty('correlationId');
  });

  test('does not expose display row tool names as renderer metadata', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-padded-name',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          toolName: ' read_file ',
        },
      },
      {
        id: 'msg-tool-progress-object-name',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
        metadata: {
          toolName: { name: 'read_file' },
        },
      },
      {
        id: 'msg-tool-progress-exact-name',
        conversationRef: 'conv-sdk',
        index: 2,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Working',
        metadata: {
          toolName: 'read_file',
        },
      },
    ] as any);

    expect(messages).toEqual([
      expect.not.objectContaining({ toolName: ' read_file ' }),
      expect.not.objectContaining({ toolName: { name: 'read_file' } }),
      expect.not.objectContaining({ toolName: 'read_file' }),
    ]);
    expect(messages[0]).not.toEqual(expect.objectContaining({ toolName: 'read_file' }));
    expect(messages[2]).toEqual(expect.objectContaining({
      type: 'tool-progress',
      text: 'Working',
    }));
  });

  test('passes exact SDK row replay action fields without deriving availability from row kind', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'visible-user-row',
        conversationRef: 'conv-sdk',
        turnRef: 'turn-visible',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'edited prompt',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
          modelFacingPayload: { ignored: true },
        },
      },
      {
        id: 'visible-assistant-row',
        conversationRef: 'conv-sdk',
        turnRef: 'turn-visible',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'final answer',
        actions: {
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
          canEdit: true,
          editTargetRowId: 'original-user-row',
          raw: { ignored: true },
        },
      },
      {
        id: 'padded-action-row',
        conversationRef: 'conv-sdk',
        turnRef: 'turn-visible',
        index: 2,
        role: 'assistant',
        type: 'assistant_message',
        content: 'padded target',
        actions: {
          canRetry: true,
          retryTargetRowId: ' padded-assistant-row ',
        },
      },
      {
        id: 'tool-progress-action-row',
        conversationRef: 'conv-sdk',
        turnRef: 'turn-visible',
        index: 3,
        role: 'assistant',
        type: 'tool_progress',
        content: 'still working',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'visible-user-row',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
        },
      }),
      expect.objectContaining({
        id: 'visible-assistant-row',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
        },
      }),
      expect.not.objectContaining({
        actions: expect.anything(),
      }),
      expect.objectContaining({
        id: 'tool-progress-action-row',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
          canRetry: true,
          retryTargetRowId: 'original-assistant-row',
        },
      }),
    ]);
  });

  test('reads SDK-authored tool details without forwarding model-facing calls', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-metadata-only',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'package.json' },
        },
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          displayCorrelationId: 'req-1',
          toolCallId: 'call-1',
          toolCallDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            toolCallId: 'call-1',
          },
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-tool-call-metadata-only',
      sender: 'assistant',
      type: 'tool-call',
      correlationId: 'req-1',
      toolCallDetails: {
        toolName: 'read_file',
        requestId: 'req-1',
        toolCallId: 'call-1',
      },
    }));
    expect(message).not.toHaveProperty('modelFacingToolCall');
  });

  test('normalizes SDK replay attachment refs without treating inline aliases as primary image bytes', () => {
    const messages = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-shot',
        conversationRef: 'conv-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look here',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          attachments: [{
            id: 'msg-user-shot:attachment:000',
            kind: 'image',
            source: 'replay',
            status: 'ready',
            screenshotRef: 'artifact-user-1',
          }],
          screenshot: 'inline-shot',
        },
      },
    ]);

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'msg-user-shot',
        sender: 'user',
        attachments: [
          expect.objectContaining({
            id: 'msg-user-shot:attachment:000',
            source: 'replay',
          }),
        ],
      }),
    ]);
    expect(messages[0]).not.toHaveProperty('screenshot');
    expect(messages[0]).not.toHaveProperty('screenshotRef');
    expect(messages[0]).not.toHaveProperty('screenshots');
  });

  test('projects tool-result attachments without forwarding legacy screenshot aliases', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-shot',
        conversationRef: 'conv-tool-shot',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'captured screen',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          toolName: 'screenshot',
          requestId: 'req-shot',
          screenshotRef: 'legacy-artifact',
          attachments: [{
            id: 'tool-output-shot:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-tool-1',
            screenshotUrl: '/api/artifacts/artifact-tool-1',
          }],
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-tool-output-shot',
      type: 'tool-output',
      attachments: [
        expect.objectContaining({
          source: 'tool_result',
          screenshotRef: 'artifact-tool-1',
        }),
      ],
    }));
    expect(message).not.toHaveProperty('screenshot');
    expect(message).not.toHaveProperty('screenshotRef');
    expect(message).not.toHaveProperty('screenshots');
  });

  test('does not adapt legacy tool-output screenshot aliases in renderer projection', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-legacy-shot',
        conversationRef: 'conv-tool-shot',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'captured screen',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          toolName: 'screenshot',
          requestId: 'req-shot',
          screenshotRef: 'legacy-artifact',
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-tool-output-legacy-shot',
      type: 'tool-output',
    }));
    expect(message).not.toHaveProperty('attachments');
    expect(message).not.toHaveProperty('screenshot');
    expect(message).not.toHaveProperty('screenshotRef');
    expect(message).not.toHaveProperty('screenshots');
  });

  test('projects multi-image SDK replay attachments into renderer attachments', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-multi-shot',
        conversationRef: 'conv-multi-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at both',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          attachments: [
            {
              id: 'msg-user-multi-shot:attachment:000',
              kind: 'image',
              source: 'replay',
              status: 'ready',
              screenshotRef: 'artifact-user-1',
            },
            {
              id: 'msg-user-multi-shot:attachment:001',
              kind: 'image',
              source: 'replay',
              status: 'ready',
              screenshotRef: 'artifact-user-2',
            },
          ],
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'msg-user-multi-shot',
        sender: 'user',
        attachments: [
          expect.objectContaining({
            screenshotRef: 'artifact-user-1',
          }),
          expect.objectContaining({
            screenshotRef: 'artifact-user-2',
          }),
        ],
      }),
    ]);
  });

  test('prefers SDK display attachments over legacy screenshot aliases', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-attachments',
        conversationRef: 'conv-attachments',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at these',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          screenshotRef: 'legacy-artifact',
          attachments: [
            {
              id: 'turn-1:attachment:000',
              kind: 'image',
              source: 'user_included',
              status: 'materializing',
              contentType: 'image/png',
              previewSrc: 'data:image/png;base64,first',
            },
            {
              id: 'turn-1:attachment:001',
              kind: 'image',
              source: 'user_included',
              status: 'ready',
              screenshotRef: 'artifact-second',
              screenshotUrl: '/api/artifacts/artifact-second',
            },
          ],
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'msg-user-attachments',
        sender: 'user',
        attachments: [
          expect.objectContaining({ id: 'turn-1:attachment:000' }),
          expect.objectContaining({ id: 'turn-1:attachment:001' }),
        ],
      }),
    ]);
    const [message] = buildChatMessagesFromSdkDisplayRows([{
      id: 'msg-user-legacy-only',
      conversationRef: 'conv-attachments',
      index: 0,
      role: 'user',
      type: 'user_message',
      content: 'legacy aliases only',
      metadata: {
        revisionId: 'rev-1',
        timestamp: '2026-06-22T12:00:00.000Z',
        screenshotRef: 'legacy-artifact',
      },
    }]);
    expect(message).not.toHaveProperty('screenshotRef');
    expect(message).not.toHaveProperty('screenshots');
  });

  test('keeps pending screenshot request descriptors without fabricating image state', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-pending-shot',
        conversationRef: 'conv-pending-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at my screen',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          attachments: [{
            id: 'turn-1:attachment:000',
            kind: 'screenshot_request',
            source: 'camera_button',
            status: 'pending_capture',
          }],
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-user-pending-shot',
      attachments: [
        expect.objectContaining({
          kind: 'screenshot_request',
          status: 'pending_capture',
        }),
      ],
    }));
    expect(message).not.toHaveProperty('screenshot');
    expect(message).not.toHaveProperty('screenshots');
    expect(message).not.toHaveProperty('screenshotRef');
  });

  test('projects SDK-adapted legacy screenshot metadata into renderer attachments', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-user-snake-shot',
        conversationRef: 'conv-snake-shot',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look here',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-21T12:00:00.000Z',
          attachments: [
            {
              id: 'msg-user-snake-shot:attachment:000',
              kind: 'image',
              source: 'replay',
              status: 'ready',
              screenshotRef: 'artifact-user-1',
              screenshotUrl: '/api/artifacts/artifact-user-1',
            },
            {
              id: 'msg-user-snake-shot:attachment:001',
              kind: 'image',
              source: 'replay',
              status: 'ready',
              screenshotRef: 'artifact-user-2',
            },
          ],
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'msg-user-snake-shot',
        sender: 'user',
        attachments: [
          expect.objectContaining({
            screenshotRef: 'artifact-user-1',
            screenshotUrl: '/api/artifacts/artifact-user-1',
          }),
          expect.objectContaining({
            screenshotRef: 'artifact-user-2',
          }),
        ],
      }),
    ]);
  });

  test('projects live SDK row ready attachments into renderer attachments', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'row-user-multi-shot',
        conversationRef: 'conv-multi-shot',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'look at both',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:00.000Z',
          attachments: [
            {
              id: 'row-user-multi-shot:attachment:000',
              kind: 'image',
              source: 'user_included',
              status: 'ready',
              screenshotRef: 'artifact-user-1',
            },
            {
              id: 'row-user-multi-shot:attachment:001',
              kind: 'image',
              source: 'camera_button',
              status: 'ready',
              screenshotRef: 'artifact-user-2',
            },
          ],
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'row-user-multi-shot',
        sender: 'user',
        text: 'look at both',
        attachments: [
          expect.objectContaining({
            screenshotRef: 'artifact-user-1',
          }),
          expect.objectContaining({
            screenshotRef: 'artifact-user-2',
          }),
        ],
      }),
    ]);
  });

  test('projects SDK streaming assistant rows with reasoning text', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'conv-1:turn-1:assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Partial answer',
        isStreaming: true,
        metadata: {
          reasoningText: 'Thinking through it.',
          sourceEventType: 'assistant_message',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'Partial answer',
        isComplete: false,
        thinkingText: 'Thinking through it.',
        sourceEventType: 'assistant_message',
      }),
    ]);
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'conv-1:turn-1:assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Partial answer',
        metadata: {
          reasoningText: 'Thinking through it.',
        },
      },
    ])[0]).not.toHaveProperty('thinkingSourceEventType');
  });

  test('does not expose padded reasoning text from display rows', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'conv-1:turn-1:assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Partial answer',
        isStreaming: true,
        metadata: {
          reasoningText: ' Thinking through it. ',
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'conv-1:turn-1:assistant',
      sender: 'assistant',
      type: 'llm-text',
      text: 'Partial answer',
      isComplete: false,
    }));
    expect(message).not.toHaveProperty('thinkingText');
    expect(message).not.toHaveProperty('thinkingSourceEventType');
    expect(message).not.toHaveProperty('sourceEventType');
    expect(message).not.toEqual(expect.objectContaining({ thinkingText: ' Thinking through it. ' }));
    expect(message).not.toEqual(expect.objectContaining({ thinkingText: 'Thinking through it.' }));
  });

  test('does not read snake-case reasoning aliases from display rows', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'conv-1:turn-1:assistant',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'Partial answer',
        isStreaming: true,
        metadata: {
          reasoning_text: 'old alias',
        },
      },
    ] as any);

    expect(message).toEqual(expect.objectContaining({
      id: 'conv-1:turn-1:assistant',
      sender: 'assistant',
      type: 'llm-text',
      text: 'Partial answer',
      isComplete: false,
    }));
    expect(message).not.toHaveProperty('thinkingText');
    expect(message).not.toHaveProperty('thinkingSourceEventType');
    expect(message).not.toHaveProperty('sourceEventType');
  });

  test('projects SDK tool progress rows into retained tool-progress messages', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-1',
        conversationRef: 'conv-search',
        turnRef: 'turn-search',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Searched example.com',
        metadata: {
          revisionId: 'rev-search',
          timestamp: '2026-06-09T04:20:00.000Z',
          toolName: 'web_search',
          requestId: 'req-search-1',
          correlationId: 'corr-search-1',
          displayCorrelationId: 'req-search-1',
          sourceEventType: 'web-search-progress',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'progress-1',
        sender: 'assistant',
        type: 'tool-progress',
        text: 'Searched example.com',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'sdk:display-rows',
        turnRef: 'turn-search',
        correlationId: 'req-search-1',
        timestamp: '2026-06-09T04:20:00.000Z',
      }),
    ]);
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-1',
        conversationRef: 'conv-search',
        turnRef: 'turn-search',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Searched example.com',
        metadata: { toolName: 'web_search' },
      },
    ])[0]).not.toHaveProperty('toolName');
  });

  test('does not relabel generic SDK tool progress rows as web search progress', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-generic',
        conversationRef: 'conv-tool',
        turnRef: 'turn-tool',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Preparing tool result',
        metadata: {
          revisionId: 'rev-tool',
          timestamp: '2026-06-09T04:21:00.000Z',
          toolName: 'read_file',
          requestId: 'req-tool-1',
          displayCorrelationId: 'req-tool-1',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'progress-generic',
        sender: 'assistant',
        type: 'tool-progress',
        text: 'Preparing tool result',
        correlationId: 'req-tool-1',
      }),
    ]);
    expect(buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-generic',
        conversationRef: 'conv-tool',
        turnRef: 'turn-tool',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Preparing tool result',
        metadata: {
          sourceEventType: ' tool_progress ',
        },
      },
    ])[0]).not.toHaveProperty('sourceEventType');
  });

  test('does not recover tool progress details from SDK output-detail metadata', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-output-details-only',
        conversationRef: 'conv-tool',
        turnRef: 'turn-tool',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Waiting for tool output',
        metadata: {
          revisionId: 'rev-tool',
          timestamp: '2026-06-09T04:22:00.000Z',
          toolName: 'read_file',
          displayCorrelationId: 'req-tool-1',
          toolOutputDetails: {
            toolName: 'read_file',
            requestId: 'req-tool-1',
          },
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'progress-output-details-only',
      type: 'tool-progress',
      correlationId: 'req-tool-1',
    }));
    expect(message).not.toHaveProperty('toolName');
    expect(message).not.toHaveProperty('toolMetadata');
  });

  test('keeps SDK progress details on the explicit tool call details prop', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'progress-tool-call-details',
        conversationRef: 'conv-tool',
        turnRef: 'turn-tool',
        index: 0,
        role: 'assistant',
        type: 'tool_progress',
        content: 'Reading file',
        metadata: {
          revisionId: 'rev-tool',
          timestamp: '2026-06-09T04:22:30.000Z',
          toolName: 'read_file',
          displayCorrelationId: 'req-tool-1',
          toolCallDetails: {
            toolName: 'read_file',
            requestId: 'req-tool-1',
            raw: { hidden: true },
          },
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'progress-tool-call-details',
      type: 'tool-progress',
      toolCallDetails: {
        toolName: 'read_file',
        requestId: 'req-tool-1',
      },
    }));
    expect(message).not.toHaveProperty('toolMetadata');
  });

  test('does not forward raw SDK diagnostics into renderer chat details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-raw',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          toolOutputDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
          },
          raw: {
            type: 'tool-output',
            payload: { output: 'done' },
          },
        },
      },
    ]);

    expect(message.toolOutputDetails).toEqual({
      toolName: 'read_file',
      requestId: 'req-1',
    });
    expect(message.toolOutputDetails).not.toHaveProperty('raw');
  });

  test('keeps SDK tool-output success scoped to sanitized details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-success',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          success: true,
          toolOutputDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            success: false,
          },
        },
      },
    ]);

    expect(message.toolOutputDetails).toEqual({
      toolName: 'read_file',
      requestId: 'req-1',
      success: false,
    });
    expect(message).not.toHaveProperty('success');
  });

  test('does not forward structured payload aliases into renderer chat details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-structured',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'done',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:02.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          toolOutputDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
          },
          structuredPayload: {
            output: 'legacy structured output',
          },
        },
      },
    ] as any);

    expect(message.toolOutputDetails).toEqual({
      toolName: 'read_file',
      requestId: 'req-1',
    });
    expect(message.toolOutputDetails).not.toHaveProperty('structuredPayload');
  });

  test('keeps SDK display attachments out of generic tool details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-attachment-details',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'captured screen',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          toolName: 'screenshot',
          requestId: 'req-shot',
          toolOutputDetails: {
            toolName: 'screenshot',
            requestId: 'req-shot',
          },
          attachments: [{
            id: 'tool-output-shot:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-tool-1',
            screenshotUrl: '/api/artifacts/artifact-tool-1',
          }],
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-tool-output-attachment-details',
      attachments: [
        expect.objectContaining({
          id: 'tool-output-shot:attachment:000',
        }),
      ],
      toolOutputDetails: {
        toolName: 'screenshot',
        requestId: 'req-shot',
      },
    }));
    expect(message.toolOutputDetails).not.toHaveProperty('attachments');
  });

  test('sanitizes SDK-owned channels from display-row tool output details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-output-sanitized-details',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'tool',
        type: 'tool_output',
        content: 'captured screen',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-06-22T12:00:00.000Z',
          toolName: 'screenshot',
          displayCorrelationId: 'req-shot',
          toolOutputDetails: {
            toolName: 'screenshot',
            requestId: 'req-shot',
            attachments: [{
              id: 'tool-output-shot:attachment:000',
              kind: 'image',
              source: 'tool_result',
              status: 'ready',
              screenshotRef: 'artifact-tool-1',
            }],
            modelId: 'model-1',
            modelProvider: 'provider-1',
            raw: { payload: { output: 'done' } },
            screenshotRef: 'legacy-shot',
            structuredPayload: { output: 'legacy structured output' },
          },
          attachments: [{
            id: 'tool-output-shot:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-tool-1',
          }],
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      attachments: [
        expect.objectContaining({
          id: 'tool-output-shot:attachment:000',
        }),
      ],
      toolOutputDetails: {
        toolName: 'screenshot',
        requestId: 'req-shot',
      },
    }));
    expect(message.toolOutputDetails).not.toHaveProperty('attachments');
    expect(message.toolOutputDetails).not.toHaveProperty('modelId');
    expect(message.toolOutputDetails).not.toHaveProperty('modelProvider');
    expect(message.toolOutputDetails).not.toHaveProperty('raw');
    expect(message.toolOutputDetails).not.toHaveProperty('screenshotRef');
    expect(message.toolOutputDetails).not.toHaveProperty('structuredPayload');
  });

  test('sanitizes SDK-owned channels from display-row tool call details', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-sanitized-details',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'package.json' },
        },
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          displayCorrelationId: 'call-1',
          toolCallDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            modelFacingToolCall: {
              id: 'call-1',
              name: 'read_file',
              arguments: { path: 'package.json' },
            },
            modelProvider: 'provider-1',
            payload: { tool_name: 'read_file' },
            screenshotUrl: '/api/artifacts/legacy-shot',
          },
        },
      },
    ]);

    expect(message.toolCallDetails).toEqual({
      toolName: 'read_file',
      requestId: 'req-1',
    });
    expect(message.toolCallDetails).not.toHaveProperty('modelFacingToolCall');
    expect(message.toolCallDetails).not.toHaveProperty('modelProvider');
    expect(message.toolCallDetails).not.toHaveProperty('payload');
    expect(message.toolCallDetails).not.toHaveProperty('screenshotUrl');
  });

  test('keeps provider-facing and model metadata out of SDK display chat props', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-details',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: 'read_file {"path":"package.json"}',
        metadata: {
          revisionId: 'rev-1',
          timestamp: '2026-05-15T12:00:01.000Z',
          toolName: 'read_file',
          requestId: 'req-1',
          toolCallId: 'call-1',
          toolCallDetails: {
            toolName: 'read_file',
            requestId: 'req-1',
            toolCallId: 'call-1',
          },
          modelId: 'model-1',
          modelProvider: 'provider-1',
          modelFacingToolCall: {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'package.json' },
          },
        },
      },
    ]);

    expect(message).toEqual(expect.objectContaining({
      id: 'msg-tool-call-details',
      toolCallDisplayText: 'read_file {"path":"package.json"}',
      toolCallDetails: {
        toolName: 'read_file',
        requestId: 'req-1',
        toolCallId: 'call-1',
      },
    }));
    expect(message).not.toHaveProperty('modelFacingToolCall');
    expect(message.toolCallDetails).not.toHaveProperty('modelFacingToolCall');
    expect(message.toolCallDetails).not.toHaveProperty('modelId');
    expect(message.toolCallDetails).not.toHaveProperty('modelProvider');
  });
});
