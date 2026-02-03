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
});
