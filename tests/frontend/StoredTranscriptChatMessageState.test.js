import {
  buildStoredTranscriptChatMessages,
} from '../../frontend/src/renderer/infrastructure/transcript/storedTranscriptChatMessageState';

describe('storedTranscriptChatMessageState', () => {
  test('builds tool-output chat messages with screenshots and transparency fields', () => {
    const messages = buildStoredTranscriptChatMessages({
      id: 'tool-output-1',
      role: 'tool',
      message_type: 'tool-output',
      content: 'tool output text',
      correlation_id: 'req-1',
      screenshot: 'artifact-123',
      record_kind: 'transcript',
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
        structured_payload: {
          kind: 'tool-output',
          toolCallDetails: {
            request_id: 'req-1',
            output: 'tool output text',
          },
        },
      },
    }, 0);

    expect(messages).toEqual([
      {
        id: 'tool-output-1-0',
        text: 'tool output text',
        sender: 'assistant',
        type: 'tool-output',
        correlationId: 'req-1',
        modelFacingToolOutput: 'tool output text',
        toolOutputDetails: {
          request_id: 'req-1',
          output: 'tool output text',
        },
        screenshotRef: 'artifact-123',
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

  test('normalizes stored transparency tool schemas to canonical nested shape and drops invalid arrays', () => {
    const normalizedMessages = buildStoredTranscriptChatMessages({
      id: 'tool-output-2',
      role: 'tool',
      message_type: 'tool-output',
      content: 'tool output text',
      record_kind: 'transcript',
      metadata: {
        transparency: {
          systemPrompt: 'System prompt text',
          toolSchemas: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
        },
      },
    }, 0);

    expect(normalizedMessages[0].systemPrompt).toEqual({
      content: 'System prompt text',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    });
    expect(normalizedMessages[0].toolSchemas).toEqual([
      { type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } },
    ]);

    const invalidMessages = buildStoredTranscriptChatMessages({
      id: 'tool-output-3',
      role: 'tool',
      message_type: 'tool-output',
      content: 'tool output text',
      record_kind: 'transcript',
      metadata: {
        transparency: {
          systemPrompt: 'System prompt text',
          toolSchemas: [{ name: 'bad-tool' }],
        },
      },
    }, 0);

    expect(invalidMessages[0].systemPrompt).toEqual({
      content: 'System prompt text',
    });
    expect(invalidMessages[0].toolSchemas).toBeUndefined();
  });

  test('reuses shared transcript transparency normalization for stored replay fields', () => {
    const messages = buildStoredTranscriptChatMessages({
      id: 'tool-output-4',
      role: 'tool',
      message_type: 'tool-output',
      content: 'tool output text',
      record_kind: 'transcript',
      metadata: {
        transparency: {
          systemPrompt: '  Active: â€œWindieOS â€” READMEâ€\u009d  ',
          fullUserMessage: {
            content: '  <user_query>hello</user_query>  ',
            metadata: { source: 'past-chat' },
          },
          fullAssistantMessage: {
            content: '  <assistant_response>hi</assistant_response>  ',
          },
        },
      },
    }, 0);

    expect(messages[0].systemPrompt).toEqual({
      content: 'Active: “WindieOS — README”',
    });
    expect(messages[0].fullUserMessage).toEqual({
      content: '<user_query>hello</user_query>',
      metadata: { source: 'past-chat' },
    });
    expect(messages[0].fullAssistantMessage).toEqual({
      content: '<assistant_response>hi</assistant_response>',
    });
  });
});
