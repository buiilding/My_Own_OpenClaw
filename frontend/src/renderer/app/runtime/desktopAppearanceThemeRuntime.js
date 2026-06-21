/**
 * Owns renderer appearance-theme projection and fallback normalization.
 */

import { DEFAULT_APPEARANCE_THEME } from '../skin/desktopRuntimeConfig';

const VALID_APPEARANCE_MODES = new Set(['light', 'dark', 'system']);
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

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

export function normalizeAppearanceMode(value) {
  return VALID_APPEARANCE_MODES.has(value) ? value : 'system';
}

export function resolveSystemAppearanceTheme(matchMediaImpl) {
  if (typeof matchMediaImpl !== 'function') {
    return 'dark';
  }

  try {
    return matchMediaImpl('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveEffectiveAppearanceTheme(mode, matchMediaImpl = globalThis.window?.matchMedia) {
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

export function normalizeAppearanceTheme(overrides = null) {
  const source = toPlainRecord(overrides);
  return {
    light: normalizeAppearanceThemeSection(source.light, DEFAULT_APPEARANCE_THEME.light),
    dark: normalizeAppearanceThemeSection(source.dark, DEFAULT_APPEARANCE_THEME.dark),
  };
}

export function resolveAppearanceThemeSection(config, themeId) {
  const defaults = themeId === 'light'
    ? DEFAULT_APPEARANCE_THEME.light
    : DEFAULT_APPEARANCE_THEME.dark;
  return normalizeAppearanceThemeSection(config?.appearance_theme?.[themeId], defaults);
}
