import {
  DesktopTrailContextRuntime,
} from '../../src/renderer/app/runtime/desktopTrailContextRuntime';

const {
  buildTrailContextEntries,
  formatToolAction,
  formatTrailTimestamp,
} = DesktopTrailContextRuntime;

describe('DesktopTrailContextRuntime', () => {
  test('formats read_file and run_shell_command tool calls as log lines', () => {
    const entries = buildTrailContextEntries([
      {
        id: 'read-row',
        type: 'tool-call',
        toolCallDisplayText: JSON.stringify({
          name: 'read_file',
          arguments: { path: '/tmp/project/README.md' },
        }),
        timestamp: '2026-06-30T17:05:00.000Z',
      },
      {
        id: 'shell-row',
        type: 'tool-call',
        toolCallDisplayText: JSON.stringify({
          name: 'run_shell_command',
          arguments: { command: 'npm test -- --runInBand' },
        }),
      },
      {
        id: 'output-row',
        type: 'tool-output',
        text: 'ignored',
      },
    ], { fallbackDate: new Date('2026-06-30T18:06:00.000Z') });

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'read-row',
        actionText: 'Read README.md',
        iconKey: 'file',
        toolName: 'read_file',
        timeLabel: formatTrailTimestamp('2026-06-30T17:05:00.000Z'),
      }),
      expect.objectContaining({
        id: 'shell-row',
        actionText: 'Ran npm test -- --runInBand',
        iconKey: 'terminal',
        timeLabel: formatTrailTimestamp(null, new Date('2026-06-30T18:06:00.000Z')),
      }),
    ]);
  });

  test('maps builtin tool categories to concise actions', () => {
    expect(formatToolAction('mouse_control', { action: 'click', x: 10, y: 20 }))
      .toBe('Clicked (10, 20)');
    expect(formatToolAction('keyboard_control', { action: 'type', text: 'hello' }))
      .toBe('Typed hello');
    expect(formatToolAction('screenshot', {})).toBe('Captured screenshot');
    expect(formatToolAction('scroll_control', { direction: 'down' })).toBe('Scrolled down');
    expect(formatToolAction('switch_window', { window_title: 'Terminal' }))
      .toBe('Switched to Terminal');
    expect(formatToolAction('wait', { seconds: 2 })).toBe('Waited 2s');
    expect(formatToolAction('get_open_windows', {})).toBe('Listed open windows');
    expect(formatToolAction('get_system_stats', {})).toBe('Checked system stats');
    expect(formatToolAction('open_app', { app_name: 'Notes' })).toBe('Opened Notes');
    expect(formatToolAction('process', { action: 'poll' })).toBe('Managed process: poll');
    expect(formatToolAction('replace', { file_path: '/tmp/app.jsx' })).toBe('Edited app.jsx');
    expect(formatToolAction('browser', { action: 'navigate' })).toBe('Browser navigate');
    expect(formatToolAction('web_search', { query: 'WindieOS' }))
      .toBe('Searched web for WindieOS');
  });
});
