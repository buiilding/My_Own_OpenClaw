import {
  buildThinkingStatus,
  formatToolBundlePayload,
  formatToolCallPayload,
  formatToolOutputText,
} from '../../frontend/src/renderer/features/chat/utils/chatStreamFormatting';

describe('chatStreamFormatting utils', () => {
  test('trims thinking status to max window while appending chunks', () => {
    const longPrefix = 'a'.repeat(5000);
    const next = buildThinkingStatus(longPrefix, 'xyz');

    expect(next).toHaveLength(5000);
    expect(next.endsWith('xyz')).toBe(true);
  });

  test('formats raw tool call payload JSON and falls back to raw text on parse error', () => {
    expect(formatToolCallPayload({ raw_call: '{"tool":"read_file"}' })).toBe(
      JSON.stringify({ tool: 'read_file' }, null, 2),
    );
    expect(formatToolCallPayload({ raw_call: 'not-json' })).toBe('not-json');
  });

  test('formats non-raw tool call payload into canonical name/args object', () => {
    expect(
      formatToolCallPayload({ tool_name: 'read_file', parameters: { file_path: '/tmp/a' } }),
    ).toBe(
      JSON.stringify(
        { name: 'read_file', args: { file_path: '/tmp/a' } },
        null,
        2,
      ),
    );
  });

  test('formats bundle payload with default empty tools list', () => {
    expect(formatToolBundlePayload({ bundle_id: 'bundle-1' })).toBe(
      JSON.stringify({ bundle_id: 'bundle-1', tools: [] }, null, 2),
    );
  });

  test('formats tool output error and success payloads', () => {
    expect(formatToolOutputText({ error: 'boom', output: 'ignored' })).toBe('Error: boom');
    expect(formatToolOutputText({ output: 'all good' })).toBe('all good');
    expect(formatToolOutputText({})).toBe('No output');
  });
});
