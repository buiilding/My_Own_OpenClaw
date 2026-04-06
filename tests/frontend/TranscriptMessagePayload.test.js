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
    expect(resolveTranscriptMessageType({
      sender: 'assistant',
      type: 'tool-call',
      sourceEventType: 'tool-bundle',
    })).toBe('tool-bundle');
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
      tool_name: 'browser.open',
      correlation_id: 'corr-1',
      tool_call_id: 'corr-1',
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
      structured_payload: {
        kind: 'tool-call',
        toolCall: {
          id: 'call-1',
          name: 'browser.open',
          arguments: { action: 'snapshot' },
          thought_signature: 'sig-1',
        },
        toolCalls: [{
          id: 'call-1',
          name: 'browser.open',
          arguments: { action: 'snapshot' },
          thought_signature: 'sig-1',
        }],
      },
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
      structured_payload: null,
    });
  });

  test('toRehydratePayload preserves bundle source rows as tool-bundle instead of tool-call', () => {
    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'tool-call',
      sourceEventType: 'tool-bundle',
      text: '{"bundle_id":"bundle-1","tools":[{"name":"keyboard_control","args":{"action":"press","key":"ENTER"}}]}',
      correlationId: 'bundle-1',
      toolCallDetails: {
        bundle_id: 'bundle-1',
        tools: [{ name: 'keyboard_control', args: { action: 'press', key: 'ENTER' } }],
      },
    })).toEqual({
      role: 'assistant',
      content: '{"bundle_id":"bundle-1","tools":[{"name":"keyboard_control","args":{"action":"press","key":"ENTER"}}]}',
      message_type: 'tool-bundle',
      tool_name: null,
      correlation_id: null,
      tool_call_id: null,
      tool_calls: null,
      timestamp: null,
      screenshot_ref: null,
      screenshot: null,
      transparency: null,
      structured_payload: {
        kind: 'tool-bundle',
        toolCalls: [{
          name: 'keyboard_control',
          arguments: { action: 'press', key: 'ENTER' },
        }],
        toolCallDetails: {
          bundle_id: 'bundle-1',
          tools: [{ name: 'keyboard_control', args: { action: 'press', key: 'ENTER' } }],
        },
      },
    });
  });

  test('toRehydratePayload keeps assistant tool-call metadata aligned with stored-memory rehydrate payloads', () => {
    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'tool-call',
      text: 'not valid json',
      correlationId: 'call-live-1',
      toolName: 'browser.snapshot',
    })).toEqual(expect.objectContaining({
      tool_name: 'browser.snapshot',
      correlation_id: 'call-live-1',
      tool_call_id: 'call-live-1',
      tool_calls: [{
        id: 'call-live-1',
        name: 'browser.snapshot',
        arguments: {},
        thought_signature: undefined,
      }],
    }));
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
      structured_payload: null,
    });
  });

  test('toRehydratePayload preserves inline screenshots and infers refs from screenshot urls', () => {
    const inlineScreenshot = 'A'.repeat(256);

    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'tool-output',
      text: 'tool output',
      screenshot: inlineScreenshot,
    })).toEqual(expect.objectContaining({
      screenshot_ref: null,
      screenshot: inlineScreenshot,
    }));

    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'tool-output',
      text: 'tool output',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-77',
    })).toEqual(expect.objectContaining({
      screenshot_ref: 'artifact-77',
      screenshot: null,
    }));
  });

  test('toRehydratePayload skips lightweight search-source transcript rows', () => {
    expect(toRehydratePayload({
      sender: 'assistant',
      type: 'search-source',
      text: 'Searching https://example.com/source',
    })).toBeNull();
  });
});
