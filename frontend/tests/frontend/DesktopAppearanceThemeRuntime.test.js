/**
 * Covers renderer appearance theme runtime behavior.
 */

import {
  DesktopAppearanceThemeRuntime,
} from '../../src/renderer/app/runtime/desktopAppearanceThemeRuntime.js';

const {
  applyAppearanceTheme,
  getAppearanceModeDescriptors,
  getAppearanceThemeFieldDescriptors,
  getAppearanceThemeSectionDescriptors,
  getEditableAppearanceThemeDescriptor,
  normalizeAppearanceMode,
  normalizeAppearanceTheme,
  resolveAppearanceThemeSection,
  resolveEditableAppearanceThemeId,
  resolveEffectiveAppearanceTheme,
} = DesktopAppearanceThemeRuntime;

describe('desktopAppearanceThemeRuntime', () => {
  test('exposes appearance editor descriptors for settings rendering', () => {
    expect(getAppearanceModeDescriptors()).toEqual([
      { value: 'light', label: 'Light', iconKey: 'sun' },
      { value: 'dark', label: 'Dark', iconKey: 'moon' },
      { value: 'system', label: 'System', iconKey: 'monitor' },
    ]);
    expect(getAppearanceThemeSectionDescriptors()).toEqual([
      { id: 'light', title: 'Light theme' },
      { id: 'dark', title: 'Dark theme' },
    ]);
    expect(getAppearanceThemeFieldDescriptors()).toEqual([
      { key: 'accent', label: 'Accent', kind: 'color' },
      { key: 'background', label: 'Background', kind: 'color' },
      { key: 'foreground', label: 'Foreground', kind: 'color' },
      { key: 'user_message_background', label: 'User message background', kind: 'color' },
      { key: 'user_message_foreground', label: 'User message text', kind: 'color' },
      { key: 'ui_font', label: 'UI font', kind: 'font' },
      { key: 'code_font', label: 'Code font', kind: 'font' },
      { key: 'translucent_sidebar', label: 'Translucent sidebar', kind: 'toggle' },
      { key: 'contrast', label: 'Contrast', kind: 'range' },
    ]);
  });

  test('normalizes appearance mode to supported renderer values', () => {
    expect(normalizeAppearanceMode('light')).toBe('light');
    expect(normalizeAppearanceMode('dark')).toBe('dark');
    expect(normalizeAppearanceMode('system')).toBe('system');
    expect(normalizeAppearanceMode('sepia')).toBe('system');
  });

  test('normalizes appearance theme sections against the active skin defaults', () => {
    const theme = normalizeAppearanceTheme({
      light: {
        accent: '#007aff',
        background: 'invalid',
        foreground: '#111827',
        user_message_background: '#1d4ed8',
        user_message_foreground: 'bad-color',
        ui_font: 'Inter, sans-serif',
        code_font: '',
        translucent_sidebar: false,
        contrast: 101.8,
      },
    });

    expect(theme.light).toEqual({
      accent: '#007AFF',
      background: '#FFFFFF',
      foreground: '#111827',
      user_message_background: '#1D4ED8',
      user_message_foreground: '#FFFFFF',
      ui_font: 'Inter, sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: false,
      contrast: 100,
    });
    expect(theme.dark).toEqual({
      accent: '#339CFF',
      background: '#181818',
      foreground: '#FFFFFF',
      user_message_background: '#339CFF',
      user_message_foreground: '#FFFFFF',
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 60,
    });
  });

  test('keeps the default light foreground aligned with readable desktop content text', () => {
    const theme = normalizeAppearanceTheme();

    expect(theme.light.foreground).toBe('#4C4C4C');
  });

  test('resolves explicit and system appearance themes', () => {
    expect(resolveEffectiveAppearanceTheme('light', jest.fn())).toBe('light');
    expect(resolveEffectiveAppearanceTheme('dark', jest.fn())).toBe('dark');
    expect(resolveEffectiveAppearanceTheme('system', () => ({ matches: true }))).toBe('light');
    expect(resolveEffectiveAppearanceTheme('system', () => ({ matches: false }))).toBe('dark');
  });

  test('resolves the single editable appearance theme from explicit and system modes', () => {
    expect(resolveEditableAppearanceThemeId('light', jest.fn())).toBe('light');
    expect(resolveEditableAppearanceThemeId('dark', jest.fn())).toBe('dark');
    expect(resolveEditableAppearanceThemeId('system', () => ({ matches: true }))).toBe('light');
    expect(resolveEditableAppearanceThemeId('system', () => ({ matches: false }))).toBe('dark');
    expect(getEditableAppearanceThemeDescriptor('system', () => ({ matches: true }))).toEqual({
      id: 'light',
      title: 'System theme (currently Light)',
    });
  });

  test('resolves config theme sections without exposing raw skin defaults to UI code', () => {
    expect(resolveAppearanceThemeSection({
      appearance_theme: {
        dark: {
          accent: '#F97316',
          contrast: -10,
        },
      },
    }, 'dark')).toEqual({
      accent: '#F97316',
      background: '#181818',
      foreground: '#FFFFFF',
      user_message_background: '#339CFF',
      user_message_foreground: '#FFFFFF',
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 0,
    });
  });

  test('owns document theme application adapter behind the runtime facade', () => {
    const target = document.createElement('html');
    const matchMedia = jest.fn();

    const cleanup = applyAppearanceTheme({
      appearance_mode: 'dark',
      appearance_theme: {
        dark: {
          accent: '#F97316',
          background: '#111827',
          foreground: '#F9FAFB',
          user_message_background: '#2563EB',
          user_message_foreground: '#F8FAFC',
          ui_font: 'Inter, sans-serif',
          code_font: 'JetBrains Mono, monospace',
          translucent_sidebar: false,
          contrast: 88,
        },
      },
    }, target, matchMedia);

    expect(target.dataset.agentThemePreference).toBe('dark');
    expect(target.dataset.agentTheme).toBe('dark');
    expect(target.dataset.agentTranslucentSidebar).toBe('false');
    expect(target.style.colorScheme).toBe('dark');
    expect(target.style.getPropertyValue('--agent-accent')).toBe('#F97316');
    expect(target.style.getPropertyValue('--appearance-background')).toBe('#111827');
    expect(target.style.getPropertyValue('--appearance-foreground')).toBe('#F9FAFB');
    expect(target.style.getPropertyValue('--appearance-contrast')).toBe('88');
    expect(target.style.getPropertyValue('--user-message-background')).toBe('#2563EB');
    expect(target.style.getPropertyValue('--user-message-foreground')).toBe('#F8FAFC');
    expect(target.style.getPropertyValue('--font-ui')).toBe('Inter, sans-serif');
    expect(target.style.getPropertyValue('--font-mono')).toBe('JetBrains Mono, monospace');
    expect(matchMedia).not.toHaveBeenCalled();
    expect(cleanup()).toBeUndefined();
  });
});
