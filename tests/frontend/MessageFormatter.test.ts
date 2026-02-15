import {
  formatBundledToolOutputMessage,
  formatSequentialStateXml,
  formatToolOutputMessage,
} from '../../frontend/src/renderer/infrastructure/services/MessageFormatter';

describe('MessageFormatter', () => {
  test('formatSequentialStateXml uses Unknown when missing', () => {
    const xml = formatSequentialStateXml(null);
    expect(xml).toContain('<active_window>Unknown</active_window>');
    expect(xml).toContain('<mouse_position>Unknown</mouse_position>');
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
      { active_window: 'App', mouse_position: '1,1' },
    );

    expect(output).toContain('read_file output:');
    expect(output).toContain('hello');
    expect(output).toContain('status: successful');
    expect(output).toContain('<active_window>App</active_window>');
    expect(output).toContain('State of the screen after read_file was executed:');
  });

  test('formatToolOutputMessage formats failure', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: false, error: 'boom', data: null },
      null,
    );
    expect(output).toContain('error: boom');
    expect(output).toContain('status: failed');
  });

  test('formatBundledToolOutputMessage includes system context and screenshot indicator', () => {
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
      { active_window: 'App', mouse_position: '2,2' },
      'shot',
    );

    expect(output).toContain('Bundled tool execution output:');
    expect(output).toContain('read_file output:');
    expect(output).toContain('status: successful');
    expect(output).toContain('write_file output:');
    expect(output).toContain('status: failed');
    expect(output).toContain('<active_window>App</active_window>');
    expect(output).toContain('State of the screen after bundled tools were executed:');
  });

  test('formatToolOutputMessage uses string data payload', () => {
    const output = formatToolOutputMessage(
      'read_file',
      { success: true, data: 'raw text' },
      null,
    );
    expect(output).toContain('raw text');
    expect(output).toContain('status: successful');
  });

  test('formatToolOutputMessage uses message field and screenshot indicator', () => {
    const output = formatToolOutputMessage(
      'screenshot',
      { success: true, data: { message: 'ok', screenshot: 'shot' } },
      null,
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
      null,
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
      null,
    );
    expect(bundledOutput).toContain('bundle-output');
    expect(bundledOutput).not.toContain('bundle-message');
  });

  test('formatSequentialStateXml fills missing fields with Unknown', () => {
    const xml = formatSequentialStateXml({ active_window: 'Browser' });
    expect(xml).toContain('<active_window>Browser</active_window>');
    expect(xml).toContain('<mouse_position>Unknown</mouse_position>');
  });

  test('formatBundledToolOutputMessage omits screenshot indicator when absent', () => {
    const output = formatBundledToolOutputMessage(
      [
        { tool_name: 'read_file', success: true, data: { output: 'ok' } },
      ],
      null,
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
    );

    expect(output).toContain('run_shell_command output:');
    expect(output).toContain('ls output line');
    expect(output).toContain('status: successful');
    expect(output).not.toContain('No output');
  });
});
