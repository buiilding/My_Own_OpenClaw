/**
 * Covers sdk display chat message projection. behavior in the frontend test suite.
 */

import { DesktopSdkDisplayChatMessageProjectionRuntime } from '../../src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime';

const {
  buildChatMessagesFromSdkDisplayRows,
} = DesktopSdkDisplayChatMessageProjectionRuntime;

describe('sdkDisplayChatMessageProjection', () => {
  test('projects SDK display messages into existing chat message shapes', () => {
    expect(buildChatMessagesFromSdkDisplayRows([
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
        },
      },
      {
        id: 'msg-tool-call',
        conversationRef: 'conv-sdk',
        index: 1,
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
    ])).toEqual([
      expect.objectContaining({
        id: 'msg-user',
        sender: 'user',
        text: 'open package json',
        turnRef: null,
        sourceEventType: 'user_message',
        sourceChannel: 'sdk:display-rows',
        timestamp: '2026-05-15T12:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'msg-tool-call',
        sender: 'assistant',
        type: 'tool-call',
        correlationId: 'req-1',
        toolCallDisplayText: expect.stringContaining('"name": "read_file"'),
      }),
      expect.objectContaining({
        id: 'msg-tool-output',
        sender: 'assistant',
        type: 'tool-output',
        correlationId: 'req-1',
        success: true,
      }),
      expect.objectContaining({
        id: 'msg-assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'package json is loaded',
      }),
    ]);
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
        id: 'msg-tool-progress-object-content',
        conversationRef: 'conv-sdk',
        index: 3,
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
        id: 'msg-tool-progress-object-content',
        text: '',
      }),
    ]);
  });

  test('keeps SDK-declared structured tool display rows visible', () => {
    const [toolCall, toolBundleOutput] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-structured-content',
        conversationRef: 'conv-sdk',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'package.json' },
        },
      },
      {
        id: 'msg-tool-bundle-output-structured-content',
        conversationRef: 'conv-sdk',
        index: 1,
        role: 'tool',
        type: 'tool_bundle_output',
        content: {
          step_results: [{
            output: 'package contents',
          }],
        },
      },
    ]);

    expect(toolCall).toEqual(expect.objectContaining({
      id: 'msg-tool-call-structured-content',
      text: expect.stringContaining('"name": "read_file"'),
      toolCallDisplayText: expect.stringContaining('"path": "package.json"'),
    }));
    expect(toolBundleOutput).toEqual(expect.objectContaining({
      id: 'msg-tool-bundle-output-structured-content',
      text: expect.stringContaining('"step_results"'),
    }));
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

  test('projects SDK row action metadata and replay target ids', () => {
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
          editTargetRowId: ' original-user-row ',
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
          retryTargetRowId: ' original-assistant-row ',
        },
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'visible-user-row',
        actions: {
          canEdit: true,
          editTargetRowId: 'original-user-row',
        },
      }),
      expect.objectContaining({
        id: 'visible-assistant-row',
        actions: {
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
        thinkingSourceEventType: 'reasoning_delta',
        sourceEventType: 'assistant_delta',
      }),
    ]);
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
      sourceEventType: 'assistant_delta',
    }));
    expect(message).not.toHaveProperty('thinkingText');
    expect(message).not.toHaveProperty('thinkingSourceEventType');
  });

  test('projects SDK tool progress rows into retained search-source messages', () => {
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
        type: 'search-source',
        text: 'Searched example.com',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'sdk:display-rows',
        turnRef: 'turn-search',
        toolName: 'web_search',
        correlationId: 'req-search-1',
        timestamp: '2026-06-09T04:20:00.000Z',
      }),
    ]);
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

  test('keeps provider-facing and model metadata out of SDK display chat props', () => {
    const [message] = buildChatMessagesFromSdkDisplayRows([
      {
        id: 'msg-tool-call-details',
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
      toolCallDisplayText: expect.stringContaining('"name": "read_file"'),
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
