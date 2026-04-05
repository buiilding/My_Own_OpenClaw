import {
  CAPTURE_ONLY_COMPUTER_USE_TOOLS,
  INTERACTIVE_COMPUTER_USE_TOOLS,
  STANDARD_COMPUTER_USE_TOOLS,
} from '../../frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog';

describe('ToolComputerUseCatalog', () => {
  test('exports canonical interactive and capture-only computer-use tool names', () => {
    expect(INTERACTIVE_COMPUTER_USE_TOOLS).toEqual([
      'mouse_control',
      'keyboard_control',
      'scroll_control',
      'click',
      'type',
      'scroll',
    ]);

    expect(CAPTURE_ONLY_COMPUTER_USE_TOOLS).toEqual([
      'screenshot',
      'switch_window',
      'wait',
    ]);
  });

  test('exports a stable combined catalog without duplicates', () => {
    expect(STANDARD_COMPUTER_USE_TOOLS).toEqual([
      ...INTERACTIVE_COMPUTER_USE_TOOLS,
      ...CAPTURE_ONLY_COMPUTER_USE_TOOLS,
    ]);

    const uniqueNames = new Set(STANDARD_COMPUTER_USE_TOOLS);
    expect(uniqueNames.size).toBe(STANDARD_COMPUTER_USE_TOOLS.length);
  });

  test('keeps renderer execution catalog concrete and excludes unified computer_use wrapper', () => {
    expect(STANDARD_COMPUTER_USE_TOOLS).not.toContain('computer_use');
    expect(INTERACTIVE_COMPUTER_USE_TOOLS).toEqual(
      expect.arrayContaining(['mouse_control', 'keyboard_control', 'scroll_control']),
    );
    expect(CAPTURE_ONLY_COMPUTER_USE_TOOLS).toEqual(
      expect.arrayContaining(['screenshot', 'switch_window', 'wait']),
    );
  });
});
