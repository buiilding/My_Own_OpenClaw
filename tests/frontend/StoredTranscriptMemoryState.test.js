import {
  resolveStoredTranscriptMemoryState,
} from '../../frontend/src/renderer/infrastructure/transcript/storedTranscriptMemoryState';

describe('storedTranscriptMemoryState', () => {
  test('normalizes stored transcript memory fields from memory and metadata aliases', () => {
    const state = resolveStoredTranscriptMemoryState({
      content: 'tool output',
      role: 'tool',
      messageType: 'tool_output',
      toolName: 'read_file',
      correlationId: 'req-1',
      metadata: {
        tool_call_id: 'call-1',
        transparency: {
          systemPrompt: 'System prompt',
        },
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: {
            request_id: 'req-1',
            output: 'tool output',
          },
        },
      },
      modelProvider: ' OpenAI ',
      model_id: 'gpt-5.4',
      screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-77',
      record_kind: 'transcript',
      timestamp: '2026-04-05T12:00:00Z',
    });

    expect(state).toEqual({
      metadata: expect.objectContaining({
        tool_call_id: 'call-1',
      }),
      rawContent: 'tool output',
      role: 'tool',
      messageType: 'tool_output',
      normalizedMessageType: 'tool-output',
      modelProvider: 'OpenAI',
      modelId: 'gpt-5.4',
      correlationId: 'req-1',
      toolName: 'read_file',
      toolCallId: 'call-1',
      timestamp: '2026-04-05T12:00:00Z',
      structuredToolPayload: {
        kind: 'tool-output',
        toolCallDetails: {
          request_id: 'req-1',
          output: 'tool output',
        },
      },
      transparency: {
        systemPrompt: 'System prompt',
      },
      screenshotAttachment: {
        hasRemoteScreenshot: true,
        screenshot: null,
        screenshotRef: 'artifact-77',
        screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-77',
        screenshotContentType: null,
      },
    });
  });
});
