import { resolveActiveWindowContext } from '../../frontend/src/renderer/features/chat/utils/activeWindowContext';

describe('activeWindowContext', () => {
  test('returns default context when input is missing', () => {
    expect(resolveActiveWindowContext(null)).toEqual({
      label: 'No active app',
      icon: '--',
      fullLabel: 'No active app',
    });
  });

  test('maps browser windows to browser context', () => {
    expect(resolveActiveWindowContext('Inbox - Chrome')).toEqual({
      label: 'Chrome',
      icon: 'WB',
      fullLabel: 'Inbox - Chrome',
    });
  });

  test('maps editor windows to code context', () => {
    expect(resolveActiveWindowContext('main.py - Visual Studio Code')).toEqual({
      label: 'Code',
      icon: 'ED',
      fullLabel: 'main.py - Visual Studio Code',
    });
  });

  test('falls back to compact app segment and icon initials', () => {
    expect(resolveActiveWindowContext('Deeply Custom App Name - Internal Tooling'))
      .toEqual({
        label: 'Internal Tooling',
        icon: 'IN',
        fullLabel: 'Internal Tooling',
      });
  });
});

