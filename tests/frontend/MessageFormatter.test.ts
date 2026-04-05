import {
  formatBundledToolOutputMessage,
  formatToolOutputMessage,
} from '../../frontend/src/renderer/infrastructure/services/MessageFormatter';

describe('MessageFormatter', () => {
  test('formatToolOutputMessage does not inject system context when state is missing', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: true, data: { output: 'ok' } },
    );
    expect(output).not.toContain('<system_context>');
  });

  test('formatToolOutputMessage formats success with llm_content and screenshot indicator', () => {
    const output = formatToolOutputMessage(
      'read_file',
      {
        success: true,
        data: {
          llm_content: 'hello',
          screenshot: 'shot',
        },
      },
    );

    expect(output).toContain('read_file output:');
    expect(output).toContain('hello');
    expect(output).toContain('status: successful');
    expect(output).not.toContain('<system_context>');
    expect(output).toContain('State of the screen after read_file was executed:');
  });

  test('formatToolOutputMessage treats screenshot_ref as indicator and excludes screenshot fields from text', () => {
    const output = formatToolOutputMessage(
      'mouse_control',
      {
        success: true,
        data: {
          llm_content: 'clicked',
          screenshot_ref: 'artifact:shot-xyz',
          screenshot_id: 'legacy-shot-id',
        },
      },
    );

    expect(output).toContain('State of the screen after mouse_control was executed:');
    expect(output).not.toContain('screenshot_ref');
    expect(output).not.toContain('screenshot_id');
  });

  test('formatToolOutputMessage formats failure', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: false, error: 'boom', data: null },
    );
    expect(output).toContain('error: boom');
    expect(output).toContain('status: failed');
  });

  test('formatBundledToolOutputMessage includes screenshot indicator without system context', () => {
    const output = formatBundledToolOutputMessage(
      [
        {
          tool_name: 'read_file',
          success: true,
          data: { output: 'ok' },
        },
        {
          tool_name: 'write_file',
          success: false,
          error: 'fail',
        },
      ],
      'shot',
    );

    expect(output).toContain('Bundled tool execution output:');
    expect(output).toContain('read_file output:');
    expect(output).toContain('status: successful');
    expect(output).toContain('write_file output:');
    expect(output).toContain('status: failed');
    expect(output).not.toContain('<system_context>');
    expect(output).toContain('State of the screen after bundled tools were executed:');
  });

  test('formatToolOutputMessage uses string data payload', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: true, data: 'raw text' },
    );
    expect(output).toContain('raw text');
    expect(output).toContain('status: successful');
  });

  test('formatToolOutputMessage uses message field and screenshot indicator', () => {
    const output = formatToolOutputMessage(
      'screenshot',
      { success: true, data: { message: 'ok', screenshot: 'shot' } },
    );
    expect(output).toContain('ok');
    expect(output).toContain('State of the screen after screenshot was executed:');
  });

  test('prefers output over message for single and bundled tool formatting', () => {
    const singleOutput = formatToolOutputMessage(
      'read_file',
      {
        success: true,
        data: {
          output: 'from-output',
          message: 'from-message',
        },
      },
    );
    expect(singleOutput).toContain('from-output');
    expect(singleOutput).not.toContain('from-message');

    const bundledOutput = formatBundledToolOutputMessage(
      [
        {
          tool_name: 'read_file',
          success: true,
          data: {
            output: 'bundle-output',
            message: 'bundle-message',
          },
        },
      ],
      null,
    );
    expect(bundledOutput).toContain('bundle-output');
    expect(bundledOutput).not.toContain('bundle-message');
  });

  test('formatToolOutputMessage ignores provided system state', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: true, data: { output: 'ok' } },
    );
    expect(output).not.toContain('<system_context>');
  });

  test('formatToolOutputMessage never serializes XML-sensitive system state values', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: true, data: { output: 'ok' } },
    );
    expect(output).not.toContain('<Root>');
  });

  test('formatBundledToolOutputMessage omits screenshot indicator when absent', () => {
    const output = formatBundledToolOutputMessage(
      [
        { tool_name: 'read_file', success: true, data: { output: 'ok' } },
      ],
      null,
    );
    expect(output).not.toContain('State of the screen after bundled tools were executed:');
  });

  test('formatToolOutputMessage stringifies remaining fields without screenshot/system_state', () => {
    const output = formatToolOutputMessage(
      'write_file',
      {
        success: true,
        data: {
          foo: 'bar',
          screenshot: 'shot',
          system_state: { active_window: 'App' },
        },
      },
    );
    expect(output).toContain('"foo": "bar"');
    expect(output).not.toContain('screenshot');
    expect(output).not.toContain('system_state');
  });

  test('formatToolOutputMessage treats screenshot_ref as screenshot indicator only', () => {
    const output = formatToolOutputMessage(
      'screenshot',
      {
        success: true,
        data: {
          screenshot_ref: 'artifact:123',
          metadata: { foo: 'bar' },
        },
      },
    );
    expect(output).toContain('"metadata"');
    expect(output).not.toContain('screenshot_ref');
    expect(output).toContain('State of the screen after screenshot was executed:');
  });

  test('formatToolOutputMessage falls back to No output when only non-text fields exist', () => {
    const output = formatToolOutputMessage(
      'screenshot',
      {
        success: true,
        data: {
          screenshot: 'shot',
          system_state: { active_window: 'App' },
        },
      },
    );
    expect(output).toContain('No output');
    expect(output).toContain('status: successful');
  });

  test('formatToolOutputMessage treats image_data as screenshot indicator', () => {
    const output = formatToolOutputMessage(
      'screenshot',
      {
        success: true,
        data: {
          image_data: 'inline-image',
        },
      },
    );
    expect(output).toContain('State of the screen after screenshot was executed:');
  });

  test('formatToolOutputMessage renders top-level snapshot as readable text', () => {
    const output = formatToolOutputMessage(
      'snapshot',
      {
        success: true,
        data: {
          action: 'snapshot',
          format: 'ai',
          url: 'https://example.com',
          snapshot: 'Title: Example\n- button "Continue" [ref=e1]',
        },
      },
    );

    expect(output).toContain('snapshot output:');
    expect(output).toContain('"action": "snapshot"');
    expect(output).toContain('Snapshot:');
    expect(output).toContain('Title: Example');
    expect(output).not.toContain('"snapshot":');
    expect(output).toContain('status: successful');
  });

  test('formatToolOutputMessage renders post_action_snapshot as readable text', () => {
    const output = formatToolOutputMessage(
      'wait',
      {
        success: true,
        data: {
          action: 'wait',
          type: 'time',
          seconds: 2,
          post_action_snapshot: {
            action: 'snapshot',
            format: 'ai',
            url: 'https://example.com/product',
            snapshot: 'Title: Product\n- link "Buy now" [ref=e2]',
          },
        },
      },
    );

    expect(output).toContain('wait output:');
    expect(output).toContain('"action": "wait"');
    expect(output).toContain('"seconds": 2');
    expect(output).toContain('Post-action snapshot:');
    expect(output).toContain('"action": "snapshot"');
    expect(output).toContain('Title: Product');
    expect(output).not.toContain('"post_action_snapshot":');
    expect(output).toContain('status: successful');
  });

  test('formatToolOutputMessage unescapes literal newline sequences in snapshot text', () => {
    const output = formatToolOutputMessage(
      'wait',
      {
        success: true,
        data: {
          action: 'wait',
          post_action_snapshot: {
            action: 'snapshot',
            snapshot: 'Title: Product\\n- link "Buy now" [ref=e2]',
          },
        },
      },
      null,
    );

    expect(output).toContain('Title: Product\n- link "Buy now" [ref=e2]');
    expect(output).not.toContain('Title: Product\\n- link "Buy now" [ref=e2]');
  });

  test('formatBundledToolOutputMessage prefers _rawResult payload when provided', () => {
    const output = formatBundledToolOutputMessage(
      [
        {
          tool_name: 'read_file',
          success: true,
          data: { output: 'outer-success' },
          _rawResult: {
            success: false,
            error: 'inner-failure',
            data: { output: 'inner-output' },
          },
        },
      ],
      null,
    );

    expect(output).toContain('error: inner-failure');
    expect(output).toContain('status: failed');
    expect(output).not.toContain('outer-success');
  });

  test('formatBundledToolOutputMessage renders _rawResult output content for successful steps', () => {
    const output = formatBundledToolOutputMessage(
      [
        {
          tool_name: 'run_shell_command',
          success: true,
          data: null,
          _rawResult: {
            success: true,
            data: { output: 'ls output line' },
          },
        },
      ],
      null,
    );

    expect(output).toContain('run_shell_command output:');
    expect(output).toContain('ls output line');
    expect(output).toContain('status: successful');
    expect(output).not.toContain('No output');
  });
});
