import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../frontend/src/renderer/infrastructure/transcript/toolCallMessageState';

describe('toolCallMessageState', () => {
  test('normalizes live tool-call payloads into one canonical message state', () => {
    expect(buildToolCallMessageState({
      rawToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
      },
      fallbackToolName: 'browser.open',
      fallbackToolCallId: 'request-1',
      metadata: {
        source: 'backend',
        model_facing_tool_call: { ignored: true },
      },
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'request-1',
    })).toEqual({
      text: JSON.stringify({
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
        metadata: { source: 'backend' },
      }, null, 2),
      toolCallDisplayText: JSON.stringify({
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
        metadata: { source: 'backend' },
      }, null, 2),
      modelFacingToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
        metadata: { source: 'backend' },
      },
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'request-1',
    });
  });

  test('prefers raw parse-recovery preview text while preserving normalized metadata fields', () => {
    const messageState = buildToolCallMessageState({
      rawToolCall: {
        id: 'call-2',
        name: 'shell',
      },
      fallbackToolName: 'shell',
      metadata: {
        llm_tool_call_validation_failed: true,
        llm_tool_call_raw_tool_call_preview: 'shell("pwd")',
        llm_tool_call_parse_error: 'bad json',
      },
    });

    expect(messageState.text).toBe('shell("pwd")');
    expect(messageState.toolCallDisplayText).toBe('shell("pwd")');
    expect(messageState.modelFacingToolCall).toEqual({
      id: 'call-2',
      name: 'shell',
      metadata: {
        llm_tool_call_validation_failed: true,
        llm_tool_call_raw_tool_call_preview: 'shell("pwd")',
        llm_tool_call_parse_error: 'bad json',
      },
      parse_error: 'bad json',
      raw_tool_call_preview: 'shell("pwd")',
    });
  });

  test('normalizes bundle payloads with consistent tool display structure', () => {
    expect(buildToolBundleMessageState({
      bundle_id: 'bundle-1',
      tools: [
        {
          name: 'browser.open',
          args: { url: 'https://example.com' },
          metadata: {
            model_facing_tool_call: {
              id: 'call-3',
              name: 'browser.open',
            },
          },
        },
      ],
    })).toEqual({
      text: JSON.stringify({
        bundle_id: 'bundle-1',
        tools: [{
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        }],
      }, null, 2),
      toolCallDisplayText: JSON.stringify({
        bundle_id: 'bundle-1',
        tools: [{
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        }],
      }, null, 2),
      modelFacingToolCall: null,
      toolCalls: [
        {
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        },
      ],
      toolCallDetails: {
        bundle_id: 'bundle-1',
        tools: [
          {
            name: 'browser.open',
            args: { url: 'https://example.com' },
            metadata: {
              model_facing_tool_call: {
                id: 'call-3',
                name: 'browser.open',
              },
            },
          },
        ],
      },
      correlationId: 'bundle-1',
    });
  });
});
