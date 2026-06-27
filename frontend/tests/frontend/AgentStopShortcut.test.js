/**
 * Covers agent stop shortcut. behavior in the frontend test suite.
 */

import {
  getGlobalAgentStopShortcutOptions,
  getAgentStopShortcutLabel,
  getGlobalAgentStopShortcutLabel,
  normalizeGlobalAgentStopShortcutAccelerator,
  isAgentStopShortcutEvent,
} from '../../src/renderer/infrastructure/shortcuts/agentStopShortcut';

describe('agent stop shortcut helper', () => {
  const originalNavigatorPlatform = window.navigator.platform;
  const originalUserAgentData = window.navigator.userAgentData;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalNavigatorPlatform,
    });
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: originalUserAgentData,
    });
  });

  test('matches Escape with no modifiers', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });

    expect(getAgentStopShortcutLabel()).toBe('Esc');
    expect(isAgentStopShortcutEvent(event)).toBe(true);
  });

  test('renders macOS global stop shortcut label', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    expect(getGlobalAgentStopShortcutLabel()).toBe('Command + Shift + Esc');
  });

  test('renders Windows global stop shortcut label', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    expect(getGlobalAgentStopShortcutLabel()).toBe('Ctrl + Alt + .');
  });

  test('renders Linux global stop shortcut label', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux x86_64',
    });

    expect(getGlobalAgentStopShortcutLabel()).toBe('Ctrl + Shift + Esc');
  });

  test('prefers userAgentData platform when resolving shortcut options', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux x86_64',
    });
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform: 'macOS' },
    });

    expect(getGlobalAgentStopShortcutLabel()).toBe('Command + Shift + Esc');
  });

  test('renders override labels for supported accelerators', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    expect(getGlobalAgentStopShortcutLabel('CommandOrControl+Shift+.')).toBe('Ctrl + Shift + .');
  });

  test('trims supported accelerators before matching', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    expect(normalizeGlobalAgentStopShortcutAccelerator(' CommandOrControl+Alt+/ ')).toBe(
      'CommandOrControl+Alt+/',
    );
    expect(getGlobalAgentStopShortcutLabel(' CommandOrControl+Alt+/ ')).toBe('Ctrl + Alt + /');
  });

  test('normalizes unsupported accelerators back to the platform default', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    expect(normalizeGlobalAgentStopShortcutAccelerator('CommandOrControl+Alt+/'))
      .toBe('CommandOrControl+Shift+Escape');
  });

  test('returns the supported renderer shortcut options for the active platform', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux x86_64',
    });

    expect(getGlobalAgentStopShortcutOptions()).toEqual([
      { accelerator: 'CommandOrControl+Shift+Escape', label: 'Ctrl + Shift + Esc' },
      { accelerator: 'CommandOrControl+Alt+.', label: 'Ctrl + Alt + .' },
      { accelerator: 'CommandOrControl+Shift+.', label: 'Ctrl + Shift + .' },
    ]);
  });

  test('rejects Escape with modifiers', () => {
    const modifiedEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });

    expect(isAgentStopShortcutEvent(modifiedEvent)).toBe(false);
  });

  test('rejects Esc alias, repeat, and non-event inputs', () => {
    expect(isAgentStopShortcutEvent({ key: 'Esc', repeat: false })).toBe(false);
    expect(isAgentStopShortcutEvent({ key: 'Escape', repeat: true })).toBe(false);
    expect(isAgentStopShortcutEvent(null)).toBe(false);
  });
});
