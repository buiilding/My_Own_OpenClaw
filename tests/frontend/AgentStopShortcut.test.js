import {
  getAgentStopShortcutLabel,
  isAgentStopShortcutEvent,
} from '../../frontend/src/renderer/infrastructure/shortcuts/agentStopShortcut';

describe('agent stop shortcut helper', () => {
  test('matches ctrl+alt+period on non-mac', () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux x86_64',
    });

    const event = new KeyboardEvent('keydown', {
      key: '.',
      code: 'Period',
      ctrlKey: true,
      altKey: true,
      cancelable: true,
      bubbles: true,
    });

    expect(getAgentStopShortcutLabel()).toBe('Ctrl + Alt + .');
    expect(isAgentStopShortcutEvent(event)).toBe(true);

    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
  });

  test('requires meta+alt+period on mac', () => {
    const originalPlatform = window.navigator.platform;
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    const macEvent = new KeyboardEvent('keydown', {
      key: '.',
      code: 'Period',
      metaKey: true,
      altKey: true,
      cancelable: true,
      bubbles: true,
    });
    const wrongMacEvent = new KeyboardEvent('keydown', {
      key: '.',
      code: 'Period',
      ctrlKey: true,
      altKey: true,
      cancelable: true,
      bubbles: true,
    });

    expect(getAgentStopShortcutLabel()).toBe('Command + Option + .');
    expect(isAgentStopShortcutEvent(macEvent)).toBe(true);
    expect(isAgentStopShortcutEvent(wrongMacEvent)).toBe(false);

    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
  });
});

