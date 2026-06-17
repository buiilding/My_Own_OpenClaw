/**
 * Provides the apply appearance theme module for the renderer UI.
 */

import { DEFAULT_APPEARANCE_THEME } from '../utils/configStorage';

const VALID_APPEARANCE_MODES = new Set(['light', 'dark', 'system']);
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

function normalizeAppearanceMode(value) {
  return VALID_APPEARANCE_MODES.has(value) ? value : 'system';
}

function resolveSystemTheme(matchMediaImpl) {
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
  return normalizedMode === 'system' ? resolveSystemTheme(matchMediaImpl) : normalizedMode;
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}

function normalizeThemeSection(section, defaults) {
  const source = section && typeof section === 'object' && !Array.isArray(section)
    ? section
    : {};
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

function resolveThemeSection(config, themeId) {
  return normalizeThemeSection(
    config?.appearance_theme?.[themeId],
    DEFAULT_APPEARANCE_THEME[themeId],
  );
}

function applyThemeVariables(target, theme) {
  target.style.setProperty('--windie-blue', theme.accent);
  target.style.setProperty('--accent', theme.accent);
  target.style.setProperty('--appearance-background', theme.background);
  target.style.setProperty('--appearance-foreground', theme.foreground);
  target.style.setProperty('--appearance-contrast', String(theme.contrast));
  target.style.setProperty('--font-ui', theme.ui_font);
  target.style.setProperty('--font-mono', theme.code_font);
  target.dataset.agentTranslucentSidebar = theme.translucent_sidebar ? 'true' : 'false';
}

function subscribeToSystemTheme(matchMediaImpl, listener) {
  if (typeof matchMediaImpl !== 'function') {
    return () => {};
  }

  let media;
  try {
    media = matchMediaImpl('(prefers-color-scheme: light)');
  } catch {
    return () => {};
  }

  if (!media) {
    return () => {};
  }

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }

  if (typeof media.addListener === 'function') {
    media.addListener(listener);
    return () => media.removeListener?.(listener);
  }

  return () => {};
}

export function applyAppearanceTheme(
  config,
  target = globalThis.document?.documentElement,
  matchMediaImpl = globalThis.window?.matchMedia,
) {
  if (!target) {
    return () => {};
  }

  const preference = normalizeAppearanceMode(config?.appearance_mode);

  const apply = () => {
    const effectiveTheme = resolveEffectiveAppearanceTheme(preference, matchMediaImpl);
    target.dataset.agentThemePreference = preference;
    target.dataset.agentTheme = effectiveTheme;
    target.style.colorScheme = effectiveTheme;
    applyThemeVariables(target, resolveThemeSection(config, effectiveTheme));
  };

  apply();

  if (preference !== 'system') {
    return () => {};
  }

  return subscribeToSystemTheme(matchMediaImpl, apply);
}
