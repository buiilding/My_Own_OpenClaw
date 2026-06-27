/**
 * Covers appearance theme application behavior in the frontend test suite.
 */

import {
  DesktopAppearanceThemeRuntime,
} from '../../src/renderer/app/runtime/desktopAppearanceThemeRuntime.js';

const {
  applyAppearanceTheme,
} = DesktopAppearanceThemeRuntime;

function createMediaQueryList(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: jest.fn((eventName, listener) => {
      if (eventName === 'change') {
        listeners.add(listener);
      }
    }),
    removeEventListener: jest.fn((eventName, listener) => {
      if (eventName === 'change') {
        listeners.delete(listener);
      }
    }),
    setMatches(nextMatches) {
      this.matches = nextMatches;
      listeners.forEach((listener) => listener({ matches: nextMatches }));
    },
  };
}

describe('applyAppearanceTheme', () => {
  test('resolves explicit theme modes without querying the OS preference', () => {
    const lightTarget = document.createElement('html');
    const darkTarget = document.createElement('html');
    const matchMedia = jest.fn(() => createMediaQueryList(true));

    applyAppearanceTheme({ appearance_mode: 'light' }, lightTarget, matchMedia);
    applyAppearanceTheme({ appearance_mode: 'dark' }, darkTarget, matchMedia);

    expect(lightTarget.dataset.agentTheme).toBe('light');
    expect(darkTarget.dataset.agentTheme).toBe('dark');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  test('uses system color-scheme media for system mode', () => {
    const lightTarget = document.createElement('html');
    const darkTarget = document.createElement('html');
    const lightMedia = createMediaQueryList(true);
    const darkMedia = createMediaQueryList(false);

    applyAppearanceTheme({ appearance_mode: 'system' }, lightTarget, () => lightMedia);
    applyAppearanceTheme({ appearance_mode: 'system' }, darkTarget, () => darkMedia);

    expect(lightTarget.dataset.agentTheme).toBe('light');
    expect(darkTarget.dataset.agentTheme).toBe('dark');
  });

  test('applies explicit light mode attributes and theme variables', () => {
    const target = document.createElement('html');

    applyAppearanceTheme({
      appearance_mode: 'light',
      appearance_theme: {
        light: {
          accent: '#007AFF',
          background: '#FAFCFF',
          foreground: '#111827',
          user_message_background: '#1D4ED8',
          user_message_foreground: '#F8FAFC',
          ui_font: 'Manrope, sans-serif',
          code_font: 'JetBrains Mono, monospace',
          translucent_sidebar: false,
          contrast: 52,
        },
      },
    }, target, jest.fn());

    expect(target.dataset.agentThemePreference).toBe('light');
    expect(target.dataset.agentTheme).toBe('light');
    expect(target.dataset.agentTranslucentSidebar).toBe('false');
    expect(target.style.colorScheme).toBe('light');
    expect(target.style.getPropertyValue('--agent-accent')).toBe('#007AFF');
    expect(target.style.getPropertyValue('--appearance-background')).toBe('#FAFCFF');
    expect(target.style.getPropertyValue('--appearance-foreground')).toBe('#111827');
    expect(target.style.getPropertyValue('--appearance-contrast')).toBe('52');
    expect(target.style.getPropertyValue('--user-message-background')).toBe('#1D4ED8');
    expect(target.style.getPropertyValue('--user-message-foreground')).toBe('#F8FAFC');
    expect(target.style.getPropertyValue('--font-ui')).toBe('Manrope, sans-serif');
    expect(target.style.getPropertyValue('--font-mono')).toBe('JetBrains Mono, monospace');
  });

  test('updates system mode when OS color-scheme changes', () => {
    const target = document.createElement('html');
    const media = createMediaQueryList(false);
    const cleanup = applyAppearanceTheme({
      appearance_mode: 'system',
    }, target, () => media);

    expect(target.dataset.agentThemePreference).toBe('system');
    expect(target.dataset.agentTheme).toBe('dark');
    expect(target.style.colorScheme).toBe('dark');

    media.setMatches(true);

    expect(target.dataset.agentTheme).toBe('light');
    expect(target.style.colorScheme).toBe('light');

    cleanup();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
