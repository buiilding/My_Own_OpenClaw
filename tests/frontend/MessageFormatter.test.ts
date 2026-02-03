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
});
