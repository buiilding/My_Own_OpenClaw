/**
 * Owns renderer appearance-theme projection and fallback normalization.
 */

import { DesktopRuntimeConfig } from '../skin/desktopRuntimeConfig';

const {
  DEFAULT_APPEARANCE_THEME,
} = DesktopRuntimeConfig;

const VALID_APPEARANCE_MODES = new Set(['light', 'dark', 'system']);
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const APPEARANCE_MODE_DESCRIPTORS = Object.freeze([
  Object.freeze({ value: 'light', label: 'Light', iconKey: 'sun' }),
  Object.freeze({ value: 'dark', label: 'Dark', iconKey: 'moon' }),
  Object.freeze({ value: 'system', label: 'System', iconKey: 'monitor' }),
]);
const APPEARANCE_THEME_SECTION_DESCRIPTORS = Object.freeze([
  Object.freeze({ id: 'light', title: 'Light theme' }),
  Object.freeze({ id: 'dark', title: 'Dark theme' }),
]);
const APPEARANCE_THEME_FIELD_DESCRIPTORS = Object.freeze([
  Object.freeze({ key: 'accent', label: 'Accent', kind: 'color' }),
  Object.freeze({ key: 'background', label: 'Background', kind: 'color' }),
  Object.freeze({ key: 'foreground', label: 'Foreground', kind: 'color' }),
  Object.freeze({ key: 'ui_font', label: 'UI font', kind: 'font' }),
  Object.freeze({ key: 'code_font', label: 'Code font', kind: 'font' }),
  Object.freeze({ key: 'translucent_sidebar', label: 'Translucent sidebar', kind: 'toggle' }),
  Object.freeze({ key: 'contrast', label: 'Contrast', kind: 'range' }),
]);

function cloneDescriptor(descriptor) {
  return { ...descriptor };
}

function toPlainRecord(value) {
  return (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  ) ? value : {};
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}

function normalizeAppearanceMode(value) {
  return VALID_APPEARANCE_MODES.has(value) ? value : 'system';
}

function getAppearanceModeDescriptors() {
  return APPEARANCE_MODE_DESCRIPTORS.map(cloneDescriptor);
}

function getAppearanceThemeSectionDescriptors() {
  return APPEARANCE_THEME_SECTION_DESCRIPTORS.map(cloneDescriptor);
}

function getAppearanceThemeFieldDescriptors() {
  return APPEARANCE_THEME_FIELD_DESCRIPTORS.map(cloneDescriptor);
}

function resolveSystemAppearanceTheme(matchMediaImpl) {
  if (typeof matchMediaImpl !== 'function') {
    return 'dark';
  }

  try {
    return matchMediaImpl('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function resolveEffectiveAppearanceTheme(mode, matchMediaImpl = globalThis.window?.matchMedia) {
  const normalizedMode = normalizeAppearanceMode(mode);
  return normalizedMode === 'system' ? resolveSystemAppearanceTheme(matchMediaImpl) : normalizedMode;
}

function normalizeAppearanceThemeSection(overrides = null, defaults) {
  const source = toPlainRecord(overrides);
  const contrast = Number(source.contrast);

  return {
    accent: normalizeHexColor(source.accent, defaults.accent),
    background: normalizeHexColor(source.background, defaults.background),
    foreground: normalizeHexColor(source.foreground, defaults.foreground),
    ui_font: typeof source.ui_font === 'string' && source.ui_font.trim()
      ? source.ui_font
      : defaults.ui_font,
    code_font: typeof source.code_font === 'string' && source.code_font.trim()
      ? source.code_font
      : defaults.code_font,
    translucent_sidebar: typeof source.translucent_sidebar === 'boolean'
      ? source.translucent_sidebar
      : defaults.translucent_sidebar,
    contrast: Number.isFinite(contrast)
      ? Math.min(100, Math.max(0, Math.round(contrast)))
      : defaults.contrast,
  };
}

function normalizeAppearanceTheme(overrides = null) {
  const source = toPlainRecord(overrides);
  return {
    light: normalizeAppearanceThemeSection(source.light, DEFAULT_APPEARANCE_THEME.light),
    dark: normalizeAppearanceThemeSection(source.dark, DEFAULT_APPEARANCE_THEME.dark),
  };
}

function resolveAppearanceThemeSection(config, themeId) {
  const defaults = themeId === 'light'
    ? DEFAULT_APPEARANCE_THEME.light
    : DEFAULT_APPEARANCE_THEME.dark;
  return normalizeAppearanceThemeSection(config?.appearance_theme?.[themeId], defaults);
}

export const DesktopAppearanceThemeRuntime = Object.freeze({
  getAppearanceModeDescriptors,
  getAppearanceThemeFieldDescriptors,
  getAppearanceThemeSectionDescriptors,
  normalizeAppearanceMode,
  normalizeAppearanceTheme,
  resolveAppearanceThemeSection,
  resolveEffectiveAppearanceTheme,
  resolveSystemAppearanceTheme,
});
