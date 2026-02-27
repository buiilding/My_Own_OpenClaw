import {
  normalizeProvider,
  resolveTranscriptMessageType,
  resolveTranscriptRole,
  toRehydratePayload,
} from '../../frontend/src/renderer/features/chat/utils/transcriptMessagePayload';

describe('transcriptMessagePayload', () => {
  test('normalizeProvider lowercases and trims values', () => {
    expect(normalizeProvider(' OpenAI ')).toBe('openai');
    expect(normalizeProvider(null)).toBe('');
    expect(normalizeProvider(undefined)).toBe('');
  });

  test('resolveTranscriptRole maps tool and user roles', () => {
    expect(resolveTranscriptRole({ sender: 'user' })).toBe('user');
    expect(resolveTranscriptRole({ sender: 'assistant', type: 'tool-call' })).toBe('tool');
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
      toolName: 'browser.open',
      correlationId: 'corr-1',
      timestamp: '2026-02-26T10:00:00.000Z',
      screenshotRef: 'artifact://image-1',
    })).toEqual({
      role: 'tool',
      content: 'open browser',
      message_type: 'tool-call',
      tool_name: 'browser.open',
      correlation_id: 'corr-1',
      timestamp: '2026-02-26T10:00:00.000Z',
      screenshot_ref: 'artifact://image-1',
      screenshot: null,
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
      timestamp: null,
      screenshot_ref: null,
      screenshot: null,
    });
  });
});
