import {
  normalizeProvider,
  resolveTranscriptMessageType,
  resolveTranscriptRole,
  toRehydratePayload,
} from '../../frontend/src/renderer/features/chat/utils/session/transcriptMessagePayload';

describe('transcriptMessagePayload', () => {
  test('normalizeProvider lowercases and trims values', () => {
    expect(normalizeProvider(' OpenAI ')).toBe('openai');
    expect(normalizeProvider(null)).toBe('');
    expect(normalizeProvider(undefined)).toBe('');
  });

  test('resolveTranscriptRole maps tool and user roles', () => {
    expect(resolveTranscriptRole({ sender: 'user' })).toBe('user');
    expect(resolveTranscriptRole({ sender: 'assistant', type: 'tool-call' })).toBe('assistant');
    expect(resolveTranscriptRole({ sender: 'assistant', type: 'tool-output' })).toBe('tool');
    expect(resolveTranscriptRole({ sender: 'assistant', type: 'llm-text' })).toBe('assistant');
  });

  test('resolveTranscriptMessageType defaults assistant text to llm-text', () => {
    expect(resolveTranscriptMessageType({ sender: 'user', type: 'llm-text' })).toBe('user');
    expect(resolveTranscriptMessageType({ sender: 'assistant' })).toBe('llm-text');
    expect(resolveTranscriptMessageType({ sender: 'assistant', type: 'tool-call' })).toBe('tool-call');
  });

  test('toRehydratePayload maps tool metadata only for tool messages', () => {
    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'tool-call',
      text: 'open browser',
      correlationId: 'corr-1',
      modelFacingToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { action: 'snapshot' },
        thought_signature: 'sig-1',
      },
      timestamp: '2026-02-26T10:00:00.000Z',
      screenshotRef: 'artifact://image-1',
    })).toEqual({
      role: 'assistant',
      content: 'open browser',
      message_type: 'tool-call',
      tool_name: null,
      correlation_id: null,
      tool_call_id: null,
      tool_calls: [{
        id: 'call-1',
        name: 'browser.open',
        arguments: { action: 'snapshot' },
        thought_signature: 'sig-1',
      }],
      timestamp: '2026-02-26T10:00:00.000Z',
      screenshot_ref: 'artifact://image-1',
      screenshot: null,
      transparency: null,
    });

    expect(toRehydratePayload({
      sender: 'assistant',
      text: 'hello',
      toolName: 'ignored',
      correlationId: 'ignored',
      screenshotRef: 42,
    })).toEqual({
      role: 'assistant',
      content: 'hello',
      message_type: 'llm-text',
      tool_name: null,
      correlation_id: null,
      tool_call_id: null,
      tool_calls: null,
      timestamp: null,
      screenshot_ref: null,
      screenshot: null,
      transparency: null,
    });
  });

  test('toRehydratePayload restores full message content and sends transparency metadata', () => {
    expect(toRehydratePayload({
      sender: 'user',
      text: 'visible text',
      fullUserMessage: {
        content: '<full_user>original payload</full_user>',
        metadata: { source: 'user-message-full' },
      },
      systemPrompt: {
        content: 'System prompt text',
      },
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    })).toEqual({
      role: 'user',
      content: '<full_user>original payload</full_user>',
      message_type: 'user',
      tool_name: null,
      correlation_id: null,
      tool_call_id: null,
      tool_calls: null,
      timestamp: null,
      screenshot_ref: null,
      screenshot: null,
      transparency: {
        systemPrompt: 'System prompt text',
        toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
        fullUserMessage: {
          content: '<full_user>original payload</full_user>',
          metadata: { source: 'user-message-full' },
        },
      },
    });
  });
});
