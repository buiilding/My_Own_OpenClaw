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
          model_facing_tool_call: {
            id: 'tool_123',
            name: 'mouse_control',
            arguments: { action: 'click', find_coordinates_by: 'ocr', ocr_text: 'Settings' },
          },
        },
      }),
    ).toBe(
      JSON.stringify(
        {
          id: 'tool_123',
          name: 'mouse_control',
          arguments: { action: 'click', find_coordinates_by: 'ocr', ocr_text: 'Settings' },
        },
        null,
        2,
      ),
    );
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

  test('formats tool output error and success payloads', () => {
    expect(formatToolOutputText({ error: 'boom', output: 'model-facing output' })).toBe('model-facing output');
    expect(formatToolOutputText({ output: 'all good' })).toBe('all good');
    expect(formatToolOutputText({ error: 'boom' })).toBe('Error: boom');
    expect(formatToolOutputText({})).toBe('No output');
  });
});
