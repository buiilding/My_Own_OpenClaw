/**
 * Covers renderer appearance theme runtime behavior.
 */

import {
  DesktopAppearanceThemeRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopAppearanceThemeRuntime.js';

const {
  getAppearanceModeDescriptors,
  getAppearanceThemeFieldDescriptors,
  getAppearanceThemeSectionDescriptors,
  normalizeAppearanceMode,
  normalizeAppearanceTheme,
  resolveAppearanceThemeSection,
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
      ui_font: 'Inter, sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: false,
      contrast: 100,
    });
    expect(theme.dark).toEqual({
      accent: '#339CFF',
      background: '#181818',
      foreground: '#FFFFFF',
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 60,
    });
  });

  test('resolves explicit and system appearance themes', () => {
    expect(resolveEffectiveAppearanceTheme('light', jest.fn())).toBe('light');
    expect(resolveEffectiveAppearanceTheme('dark', jest.fn())).toBe('dark');
    expect(resolveEffectiveAppearanceTheme('system', () => ({ matches: true }))).toBe('light');
    expect(resolveEffectiveAppearanceTheme('system', () => ({ matches: false }))).toBe('dark');
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
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 0,
    });
  });
});
