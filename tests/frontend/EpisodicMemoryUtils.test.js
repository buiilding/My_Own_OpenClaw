import {
  DEFAULT_USER_ID,
  parseMemoriesToMessages,
  toRehydrateMessagePayload,
} from '../../frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils';

describe('episodicMemoryUtils', () => {
  test('exports expected constants', () => {
    expect(DEFAULT_USER_ID).toBe('default_user');
  });

  test('parseMemoriesToMessages drops empty legacy content payloads', () => {
    expect(parseMemoriesToMessages([{ content: '  \n\t ' }])).toEqual([]);
    expect(parseMemoriesToMessages([])).toEqual([]);
  });

  test('parseMemoriesToMessages parses legacy User/Assistant transcript format', () => {
    const memory = {
      id: 'legacy',
      content: 'User: hello there\nAssistant: hi!',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'legacy-0',
        sender: 'user',
        text: 'hello there',
        type: 'user',
        isComplete: true,
      },
      {
        id: 'legacy-1',
        sender: 'assistant',
        text: 'hi!',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages role-based parsing for user keeps screenshot', () => {
    const memory = {
      id: 'role-user',
      content: 'user says hi',
      role: 'user',
      screenshot: 'user-shot',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'role-user-0',
        sender: 'user',
        text: 'user says hi',
        type: 'llm-text',
        screenshot: 'user-shot',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages role-based parsing for assistant drops screenshot on llm-text', () => {
    const memory = {
      id: 'role-assistant',
      content: 'assistant answer',
      role: 'assistant',
      screenshot: 'assistant-shot',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'role-assistant-0',
        sender: 'assistant',
        text: 'assistant answer',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages normalizes tool role and tool-bundle message type', () => {
    const memory = {
      id: 'tool-bundle',
      content: '{"bundle_id":"bundle-1","tools":[{"name":"keyboard_control","args":{"action":"press","key":"ENTER"}}]}',
      role: 'tool',
      message_type: 'tool-bundle',
      correlation_id: 'bundle-1',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-bundle-0',
        sender: 'assistant',
        text: JSON.stringify({
          bundle_id: 'bundle-1',
          tools: [{
            name: 'keyboard_control',
            arguments: { action: 'press', key: 'ENTER' },
            metadata: undefined,
          }],
        }, null, 2),
        type: 'tool-call',
        sourceEventType: 'tool-bundle',
        correlationId: 'bundle-1',
        toolCallDisplayText: JSON.stringify({
          bundle_id: 'bundle-1',
          tools: [{
            name: 'keyboard_control',
            arguments: { action: 'press', key: 'ENTER' },
            metadata: undefined,
          }],
        }, null, 2),
        toolCallDetails: {
          bundle_id: 'bundle-1',
          tools: [{
            name: 'keyboard_control',
            args: { action: 'press', key: 'ENTER' },
          }],
        },
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages preserves assistant tool-call transcript rows', () => {
    const memory = {
      id: 'assistant-tool-call',
      content: '{"id":"call-1","name":"browser","arguments":{"action":"navigate"}}',
      role: 'assistant',
      message_type: 'tool-call',
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'assistant-tool-call-0',
        sender: 'assistant',
        text: '{"id":"call-1","name":"browser","arguments":{"action":"navigate"}}',
        type: 'tool-call',
        toolCallDisplayText: '{"id":"call-1","name":"browser","arguments":{"action":"navigate"}}',
        modelFacingToolCall: {
          id: 'call-1',
          name: 'browser',
          arguments: { action: 'navigate' },
          thought_signature: undefined,
        },
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages prefers stored structured payload for tool-call rows', () => {
    const memory = {
      id: 'assistant-tool-call-structured',
      content: 'malformed legacy display payload',
      role: 'assistant',
      message_type: 'tool-call',
      metadata: {
        structured_payload: {
          kind: 'tool-call',
          toolCall: {
            id: 'call-structured-1',
            name: 'browser',
            arguments: { action: 'snapshot' },
          },
        },
      },
    };

    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'assistant-tool-call-structured-0',
        sender: 'assistant',
        text: 'malformed legacy display payload',
        type: 'tool-call',
        toolCallDisplayText: 'malformed legacy display payload',
        modelFacingToolCall: {
          id: 'call-structured-1',
          name: 'browser',
          arguments: { action: 'snapshot' },
        },
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages prefers stored structured payload for tool-bundle rows', () => {
    const memory = {
      id: 'tool-bundle-structured',
      content: 'legacy bundle text',
      role: 'tool',
      message_type: 'tool-bundle',
      correlation_id: 'bundle-structured-1',
      metadata: {
        structured_payload: {
          kind: 'tool-bundle',
          toolCalls: [{
            name: 'keyboard_control',
            arguments: { action: 'press', key: 'ENTER' },
          }],
          toolCallDetails: {
            bundle_id: 'bundle-structured-1',
          },
        },
      },
    };

    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-bundle-structured-0',
        sender: 'assistant',
        text: JSON.stringify({
          bundle_id: 'bundle-structured-1',
          tools: [{
            name: 'keyboard_control',
            arguments: { action: 'press', key: 'ENTER' },
            metadata: undefined,
          }],
        }, null, 2),
        type: 'tool-call',
        sourceEventType: 'tool-bundle',
        correlationId: 'bundle-structured-1',
        toolCallDisplayText: JSON.stringify({
          bundle_id: 'bundle-structured-1',
          tools: [{
            name: 'keyboard_control',
            arguments: { action: 'press', key: 'ENTER' },
            metadata: undefined,
          }],
        }, null, 2),
        toolCallDetails: {
          bundle_id: 'bundle-structured-1',
          tools: [{
            name: 'keyboard_control',
            args: { action: 'press', key: 'ENTER' },
          }],
        },
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages keeps screenshot for tool-output role messages', () => {
    const memory = {
      id: 'tool-output',
      content: 'tool output text',
      role: 'tool',
      metadata: { screenshot: 'tool-shot' },
    };
    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-output-0',
        sender: 'assistant',
        text: 'tool output text',
        type: 'tool-output',
        screenshot: 'tool-shot',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages prefers stored structured payload for tool-output rows', () => {
    const memory = {
      id: 'tool-output-structured',
      content: 'tool output text',
      role: 'tool',
      message_type: 'tool-output',
      correlation_id: 'req-structured-1',
      metadata: {
        structured_payload: {
          kind: 'tool-output',
          toolCallDetails: {
            request_id: 'req-structured-1',
            tool_name: 'read_file',
            success: true,
            output: 'tool output text',
          },
        },
      },
    };

    expect(parseMemoriesToMessages([memory])).toEqual([
      {
        id: 'tool-output-structured-0',
        sender: 'assistant',
        text: 'tool output text',
        type: 'tool-output',
        correlationId: 'req-structured-1',
        modelFacingToolOutput: 'tool output text',
        toolOutputDetails: {
          request_id: 'req-structured-1',
          tool_name: 'read_file',
          success: true,
          output: 'tool output text',
        },
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages falls back to assistant llm-text for generic content', () => {
    expect(parseMemoriesToMessages([{ id: 'plain', content: 'plain message' }])).toEqual([
      {
        id: 'plain-0',
        sender: 'assistant',
        text: 'plain message',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages flattens parsed parts into chat messages', () => {
    const memories = [
      { id: 'm1', content: 'User: hi\nAssistant: hello' },
      { id: 'm2', content: 'plain' },
    ];

    expect(parseMemoriesToMessages(memories)).toEqual([
      {
        id: 'm1-0',
        text: 'hi',
        sender: 'user',
        type: 'user',
        isComplete: true,
      },
      {
        id: 'm1-1',
        text: 'hello',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
      {
        id: 'm2-0',
        text: 'plain',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages falls back to index-based IDs when memory id missing', () => {
    const messages = parseMemoriesToMessages([{ content: 'plain text' }]);
    expect(messages).toEqual([
      {
        id: '0-0',
        text: 'plain text',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages maps transcript screenshot value to screenshotRef', () => {
    const messages = parseMemoriesToMessages([
      {
        id: 'tool-1',
        role: 'tool',
        message_type: 'tool-output',
        content: 'tool output',
        screenshot: 'artifact-123',
        record_kind: 'transcript',
      },
    ]);

    expect(messages).toEqual([
      {
        id: 'tool-1-0',
        text: 'tool output',
        sender: 'assistant',
        type: 'tool-output',
        screenshotRef: 'artifact-123',
        isComplete: true,
      },
    ]);
  });

  test('parseMemoriesToMessages hydrates transcript transparency metadata for UI rendering', () => {
    const messages = parseMemoriesToMessages([
      {
        id: 'assistant-with-transparency',
        role: 'assistant',
        content: 'assistant answer',
        metadata: {
          transparency: {
            systemPrompt: 'System prompt text',
            toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
            fullUserMessage: {
              content: '<user_query>hello</user_query>',
              metadata: { source: 'past-chat' },
            },
            fullAssistantMessage: {
              content: '<assistant_response>hi</assistant_response>',
            },
          },
        },
      },
    ]);

    expect(messages).toEqual([
      {
        id: 'assistant-with-transparency-0',
        text: 'assistant answer',
        sender: 'assistant',
        type: 'llm-text',
        systemPrompt: {
          content: 'System prompt text',
          toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        },
        toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        fullUserMessage: {
          content: '<user_query>hello</user_query>',
          metadata: { source: 'past-chat' },
        },
        fullAssistantMessage: {
          content: '<assistant_response>hi</assistant_response>',
        },
        isComplete: true,
      },
    ]);
  });

  test('toRehydrateMessagePayload preserves transparency as structured payload and restores full content', () => {
    const payload = toRehydrateMessagePayload({
      role: 'assistant',
      message_type: 'llm-text',
      content: 'assistant reply',
      metadata: {
        transparency: {
          systemPrompt: 'System prompt text',
          toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
          fullUserMessage: {
            content: '<user_query>hello</user_query>',
            metadata: { source: 'user-message-full' },
          },
          fullAssistantMessage: {
            content: 'raw assistant completion',
          },
        },
      },
    });

    expect(payload.content).toBe('raw assistant completion');
    expect(payload.transparency).toEqual({
      systemPrompt: 'System prompt text',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: '<user_query>hello</user_query>',
        metadata: { source: 'user-message-full' },
      },
      fullAssistantMessage: {
        content: 'raw assistant completion',
      },
    });
  });

  test('toRehydrateMessagePayload restores full user message content when available', () => {
    const payload = toRehydrateMessagePayload({
      role: 'user',
      content: 'visible user text',
      metadata: {
        transparency: {
          fullUserMessage: {
            content: '<message><query>real user payload</query></message>',
          },
        },
      },
    });

    expect(payload.content).toBe('<message><query>real user payload</query></message>');
  });

  test('toRehydrateMessagePayload extracts tool_call payload with thought signature', () => {
    const payload = toRehydrateMessagePayload({
      role: 'tool',
      message_type: 'tool-call',
      content: JSON.stringify({
        id: 'call_123',
        name: 'mouse_control',
        arguments: { action: 'click', x: 100, y: 200 },
        thought_signature: 'sig_abc',
      }),
      correlation_id: 'corr-1',
    });

    expect(payload.tool_call_id).toBe('corr-1');
    expect(payload.tool_calls).toEqual([
      {
        id: 'call_123',
        name: 'mouse_control',
        arguments: { action: 'click', x: 100, y: 200 },
        thought_signature: 'sig_abc',
      },
    ]);
    expect(payload.structured_payload).toEqual({
      kind: 'tool-call',
      toolCall: {
        id: 'call_123',
        name: 'mouse_control',
        arguments: { action: 'click', x: 100, y: 200 },
        thought_signature: 'sig_abc',
      },
      toolCalls: [
        {
          id: 'call_123',
          name: 'mouse_control',
          arguments: { action: 'click', x: 100, y: 200 },
          thought_signature: 'sig_abc',
        },
      ],
    });
  });

  test('toRehydrateMessagePayload prefers stored structured payload for malformed tool-call content', () => {
    const payload = toRehydrateMessagePayload({
      role: 'assistant',
      message_type: 'tool-call',
      content: 'not json',
      metadata: {
        structured_payload: {
          kind: 'tool-call',
          toolCall: {
            id: 'call-structured-2',
            name: 'open_url',
            arguments: { url: 'https://example.com' },
          },
        },
      },
    });

    expect(payload.tool_calls).toEqual([
      {
        id: 'call-structured-2',
        name: 'open_url',
        arguments: { url: 'https://example.com' },
      },
    ]);
    expect(payload.structured_payload).toEqual({
      kind: 'tool-call',
      toolCall: {
        id: 'call-structured-2',
        name: 'open_url',
        arguments: { url: 'https://example.com' },
      },
      toolCalls: [
        {
          id: 'call-structured-2',
          name: 'open_url',
          arguments: { url: 'https://example.com' },
        },
      ],
    });
  });

  test('toRehydrateMessagePayload keeps content unchanged when transparency metadata is absent', () => {
    const payload = toRehydrateMessagePayload({
      role: 'assistant',
      content: 'plain content',
      metadata: {},
    });
    expect(payload.content).toBe('plain content');
    expect(payload.structured_payload).toBeNull();
  });
});
