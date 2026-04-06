import {
  buildRehydrateToolCall,
  buildTranscriptTransparencyFromChatMessage,
  normalizeTranscriptTransparency,
  parseToolCallPayload,
  resolveRehydrateContent,
} from '../../frontend/src/renderer/infrastructure/transcript/rehydratePayload';

describe('rehydratePayload helpers', () => {
  test('normalizes transcript transparency payload from stored metadata', () => {
    expect(normalizeTranscriptTransparency({
      systemPrompt: '  System prompt  ',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: '<user>payload</user>',
        metadata: { source: 'transcript' },
      },
      fullAssistantMessage: {
        content: 'assistant payload',
      },
    })).toEqual({
      systemPrompt: 'System prompt',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: '<user>payload</user>',
        metadata: { source: 'transcript' },
      },
      fullAssistantMessage: {
        content: 'assistant payload',
      },
    });
  });

  test('builds chat-message transparency with systemPrompt.toolSchemas fallback', () => {
    expect(buildTranscriptTransparencyFromChatMessage({
      systemPrompt: {
        content: 'Prompt text',
        toolSchemas: [{ type: 'function', function: { name: 'browser', parameters: { type: 'object' } } }],
      },
      fullUserMessage: {
        content: '<full-user/>',
      },
    })).toEqual({
      systemPrompt: 'Prompt text',
      toolSchemas: [{ type: 'function', function: { name: 'browser', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: '<full-user/>',
      },
    });
  });

  test('reuses shared transparency normalization for chat-message payloads', () => {
    expect(buildTranscriptTransparencyFromChatMessage({
      systemPrompt: {
        content: '  Active: â€œWindieOS â€” READMEâ€\u009d  ',
        toolSchemas: [{ type: 'function', name: 'browser', parameters: { type: 'object' } }],
      },
      fullUserMessage: {
        content: '  <full-user/>  ',
        metadata: { source: 'chat-message' },
      },
      fullAssistantMessage: {
        content: '  <full-assistant/>  ',
      },
    })).toEqual({
      systemPrompt: 'Active: “WindieOS — README”',
      toolSchemas: [{ type: 'function', function: { name: 'browser', parameters: { type: 'object' } } }],
      fullUserMessage: {
        content: '<full-user/>',
        metadata: { source: 'chat-message' },
      },
      fullAssistantMessage: {
        content: '<full-assistant/>',
      },
    });
  });

  test('resolveRehydrateContent prefers full payloads for user and assistant llm-text', () => {
    const transparency = {
      fullUserMessage: {
        content: '<full-user-message/>',
      },
      fullAssistantMessage: {
        content: '<full-assistant-message/>',
      },
    };

    expect(resolveRehydrateContent({
      role: 'user',
      messageType: 'user',
      content: 'visible user text',
      transparency,
    })).toBe('<full-user-message/>');
    expect(resolveRehydrateContent({
      role: 'assistant',
      messageType: 'llm-text',
      content: 'visible assistant text',
      transparency,
    })).toBe('<full-assistant-message/>');
    expect(resolveRehydrateContent({
      role: 'tool',
      messageType: 'tool-output',
      content: 'tool output',
      transparency,
    })).toBe('tool output');
  });

  test('parseToolCallPayload supports OpenAI function-call arguments string', () => {
    expect(parseToolCallPayload(JSON.stringify({
      type: 'function',
      function: {
        id: 'call_1',
        name: 'browser',
        arguments: '{"action":"snapshot"}',
        thoughtSignature: 'sig-1',
      },
    }))).toEqual({
      id: 'call_1',
      name: 'browser',
      arguments: { action: 'snapshot' },
      thought_signature: 'sig-1',
    });
  });

  test('buildRehydrateToolCall falls back to correlation metadata when parsed call is absent', () => {
    expect(buildRehydrateToolCall({
      parsedToolCall: null,
      fallbackToolName: 'keyboard_control',
      fallbackToolCallId: 'call_fallback',
    })).toEqual({
      id: 'call_fallback',
      name: 'keyboard_control',
      arguments: {},
      thought_signature: undefined,
    });
  });
});
