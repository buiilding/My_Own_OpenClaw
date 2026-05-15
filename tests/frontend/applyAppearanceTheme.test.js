import {
  applyAppearanceTheme,
  resolveEffectiveAppearanceTheme,
} from '../../frontend/src/renderer/app/applyAppearanceTheme';

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
    const matchMedia = jest.fn(() => createMediaQueryList(true));

    expect(resolveEffectiveAppearanceTheme('light', matchMedia)).toBe('light');
    expect(resolveEffectiveAppearanceTheme('dark', matchMedia)).toBe('dark');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  test('uses system color-scheme media for system mode', () => {
    const lightMedia = createMediaQueryList(true);
    const darkMedia = createMediaQueryList(false);

    expect(resolveEffectiveAppearanceTheme('system', () => lightMedia)).toBe('light');
    expect(resolveEffectiveAppearanceTheme('system', () => darkMedia)).toBe('dark');
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
          ui_font: 'Manrope, sans-serif',
          code_font: 'JetBrains Mono, monospace',
          translucent_sidebar: false,
          contrast: 52,
        },
      },
    }, target, jest.fn());

    expect(target.dataset.windieThemePreference).toBe('light');
    expect(target.dataset.windieTheme).toBe('light');
    expect(target.dataset.windieTranslucentSidebar).toBe('false');
    expect(target.style.colorScheme).toBe('light');
    expect(target.style.getPropertyValue('--windie-blue')).toBe('#007AFF');
    expect(target.style.getPropertyValue('--appearance-background')).toBe('#FAFCFF');
    expect(target.style.getPropertyValue('--appearance-foreground')).toBe('#111827');
    expect(target.style.getPropertyValue('--appearance-contrast')).toBe('52');
    expect(target.style.getPropertyValue('--font-ui')).toBe('Manrope, sans-serif');
    expect(target.style.getPropertyValue('--font-mono')).toBe('JetBrains Mono, monospace');
  });

  test('updates system mode when OS color-scheme changes', () => {
    const target = document.createElement('html');
    const media = createMediaQueryList(false);
    const cleanup = applyAppearanceTheme({
      appearance_mode: 'system',
    }, target, () => media);

    expect(target.dataset.windieThemePreference).toBe('system');
    expect(target.dataset.windieTheme).toBe('dark');
    expect(target.style.colorScheme).toBe('dark');

    media.setMatches(true);

    expect(target.dataset.windieTheme).toBe('light');
    expect(target.style.colorScheme).toBe('light');

    cleanup();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
