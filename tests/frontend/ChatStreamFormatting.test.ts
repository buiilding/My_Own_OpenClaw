import {
  buildThinkingStatus,
  formatToolBundlePayload,
  formatToolCallPayload,
  formatToolOutputText,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamFormatting';

describe('chatStreamFormatting utils', () => {
  test('trims thinking status to max window while appending chunks', () => {
    const longPrefix = 'a'.repeat(5000);
    const next = buildThinkingStatus(longPrefix, 'xyz');

    expect(next).toHaveLength(5000);
    expect(next.endsWith('xyz')).toBe(true);
  });

  test('buildThinkingStatus handles null inputs safely', () => {
    expect(buildThinkingStatus(null, undefined)).toBe('');
    expect(buildThinkingStatus('base', undefined)).toBe('base');
  });

  test('formats tool call payload into canonical name/args object', () => {
    expect(
      formatToolCallPayload({ tool_name: 'read_file', parameters: { file_path: '/tmp/a' } }),
    ).toBe(
      JSON.stringify(
        { name: 'read_file', arguments: { file_path: '/tmp/a' } },
        null,
        2,
      ),
    );
  });

  test('formats tool call payload from model-facing metadata when available', () => {
    expect(
      formatToolCallPayload({
        tool_name: 'mouse_control',
        parameters: { x: 120, y: 320 },
        metadata: {
          description: 'Settings button is visible in top bar',
          explanation: 'Need to open settings menu',
          expectation: 'Settings menu opens',
          model_facing_tool_call: {
            id: 'tool_123',
            name: 'mouse_control',
            arguments: { action: 'click', find_coordinates_by: 'ocr', ocr_text: 'Settings' },
            thought_signature: 'sig-123',
          },
        },
      }),
    ).toBe(
      JSON.stringify(
        {
          id: 'tool_123',
          name: 'mouse_control',
          arguments: { action: 'click', find_coordinates_by: 'ocr', ocr_text: 'Settings' },
          metadata: {
            description: 'Settings button is visible in top bar',
            explanation: 'Need to open settings menu',
            expectation: 'Settings menu opens',
          },
          thought_signature: 'sig-123',
        },
        null,
        2,
      ),
    );
  });

  test('formats recoverable parse-failure tool call with raw preview metadata', () => {
    const formatted = formatToolCallPayload({
      tool_name: 'run_shell_command',
      parameters: {},
      metadata: {
        llm_tool_call_validation_failed: true,
        skip_frontend_execution: true,
        llm_tool_call_raw_tool_call_preview: '{"id":"tool_bad","name":"run_shell_command","arguments":"{\\"command\\":\\"cat > index.html << \\\\\\"EOF\\\\\\"\\"}...[truncated]"}',
        llm_tool_call_raw_arguments_preview: '{"command":"cat > index.html << \\"EOF\\""}...[truncated]',
        llm_tool_call_parse_error: 'failed to parse streamed tool-call arguments',
      },
    });

    expect(formatted).toBe(
      '{"id":"tool_bad","name":"run_shell_command","arguments":"{\\"command\\":\\"cat > index.html << \\\\\\"EOF\\\\\\"\\"}...[truncated]"}',
    );
  });

  test('includes frontend skip marker for direct-tool validation failures', () => {
    const formatted = formatToolCallPayload({
      tool_name: 'mouse_control',
      parameters: {
        action: 'click',
        x: 100,
        y: 200,
      },
      metadata: {
        llm_tool_call_validation_failed: true,
        skip_frontend_execution: true,
      },
    });

    const parsed = JSON.parse(formatted);
    expect(parsed.name).toBe('mouse_control');
    expect(parsed.arguments).toEqual({ action: 'click', x: 100, y: 200 });
    expect(parsed.frontend_execution_skipped).toBe(true);
    expect(parsed.parse_error).toBeUndefined();
    expect(parsed.raw_arguments_preview).toBeUndefined();
  });

  test('suppresses duplicate fallback argument preview fields on validation failures', () => {
    const formatted = formatToolCallPayload({
      tool_name: 'replace',
      parameters: {
        raw_arguments_preview: '{"file_path":"/tmp/a.txt","new_string":"..."}...[truncated]',
        parse_error: 'invalid tool arguments json',
      },
      metadata: {
        llm_tool_call_validation_failed: true,
        skip_frontend_execution: true,
        llm_tool_call_raw_arguments_preview: '{"file_path":"/tmp/a.txt","new_string":"..."}...[truncated]',
        llm_tool_call_parse_error: 'invalid tool arguments json',
      },
    });

    const parsed = JSON.parse(formatted);
    expect(parsed.name).toBe('replace');
    expect(parsed.raw_arguments_preview).toContain('/tmp/a.txt');
    expect(parsed.parse_error).toBe('invalid tool arguments json');
    expect(parsed.frontend_execution_skipped).toBe(true);
    if (Object.prototype.hasOwnProperty.call(parsed, 'arguments')) {
      throw new Error(`expected parsed tool-call payload to omit arguments, got: ${JSON.stringify(parsed)}`);
    }
  });

  test('formats pre-dispatch validation failures from preserved model-facing payload', () => {
    const formatted = formatToolCallPayload({
      tool_name: 'run_shell_command',
      parameters: {
        explanation: 'Create a temporary test file to test the replace tool',
        command: "echo 'Original text to replace' > /tmp/test_replace.txt",
      },
      metadata: {
        llm_tool_call_validation_failed: true,
        skip_frontend_execution: true,
        model_facing_tool_call: {
          id: 'tool_raw_1',
          name: 'run_shell_command',
          arguments: {
            explanation: 'Create a temporary test file to test the replace tool',
            command: "echo 'Original text to replace' > /tmp/test_replace.txt",
          },
        },
      },
    });

    expect(JSON.parse(formatted)).toEqual({
      id: 'tool_raw_1',
      name: 'run_shell_command',
      arguments: {
        explanation: 'Create a temporary test file to test the replace tool',
        command: "echo 'Original text to replace' > /tmp/test_replace.txt",
      },
      metadata: {
        llm_tool_call_validation_failed: true,
        skip_frontend_execution: true,
      },
      frontend_execution_skipped: true,
    });
  });

  test('formats undefined tool call payload as empty object', () => {
    expect(formatToolCallPayload(undefined)).toBe(
      JSON.stringify({ arguments: {} }, null, 2),
    );
  });

  test('formats bundle payload with default empty tools list', () => {
    expect(formatToolBundlePayload({ bundle_id: 'bundle-1' })).toBe(
      JSON.stringify({ bundle_id: 'bundle-1', tools: [] }, null, 2),
    );
  });

  test('formats bundle payload with explicit tools list', () => {
    expect(
      formatToolBundlePayload({
        bundle_id: 'bundle-2',
        tools: [{ name: 'read_file', args: { file_path: '/tmp/a' } }],
      }),
    ).toBe(
      JSON.stringify(
        {
          bundle_id: 'bundle-2',
          tools: [{ name: 'read_file', arguments: { file_path: '/tmp/a' } }],
        },
        null,
        2,
      ),
    );
  });

  test('formats bundle payload with visible metadata on each tool', () => {
    expect(
      formatToolBundlePayload({
        bundle_id: 'bundle-5',
        tools: [{
          name: 'mouse_control',
          args: { action: 'click', x: 100, y: 200 },
          metadata: {
            description: 'Submit button is visible',
            explanation: 'Complete form submission',
            expectation: 'Form submit starts',
            model_facing_tool_call: {
              id: 'tool_789',
              name: 'mouse_control',
              arguments: { action: 'click', x: 100, y: 200 },
            },
          },
        }],
      }),
    ).toBe(
      JSON.stringify(
        {
          bundle_id: 'bundle-5',
          tools: [{
            id: 'tool_789',
            name: 'mouse_control',
            arguments: { action: 'click', x: 100, y: 200 },
            metadata: {
              description: 'Submit button is visible',
              explanation: 'Complete form submission',
              expectation: 'Form submit starts',
            },
          }],
        },
        null,
        2,
      ),
    );
  });

  test('formats bundle payload with malformed non-array tools as empty list', () => {
    expect(
      formatToolBundlePayload({
        bundle_id: 'bundle-3',
        tools: 'not-an-array' as any,
      }),
    ).toBe(
      JSON.stringify(
        {
          bundle_id: 'bundle-3',
          tools: [],
        },
        null,
        2,
      ),
    );
  });

  test('formats bundle payload with explicit null tools as empty list', () => {
    expect(
      formatToolBundlePayload({
        bundle_id: 'bundle-4',
        tools: null as any,
      }),
    ).toBe(
      JSON.stringify(
        {
          bundle_id: 'bundle-4',
          tools: [],
        },
        null,
        2,
      ),
    );
  });

  test('formats tool output error and success payloads', () => {
    expect(formatToolOutputText({ error: 'boom', output: 'model-facing output' })).toBe('model-facing output');
    expect(formatToolOutputText({ output: 'all good' })).toBe('all good');
    expect(formatToolOutputText({ error: 'boom' })).toBe('Error: boom');
    expect(formatToolOutputText({})).toBe('No output');
  });
});
