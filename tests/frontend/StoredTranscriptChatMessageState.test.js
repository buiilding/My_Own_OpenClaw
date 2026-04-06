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
});
