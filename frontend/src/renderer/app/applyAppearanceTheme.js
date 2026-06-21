/**
 * Provides the apply appearance theme module for the renderer UI.
 */

import {
  DesktopAppearanceThemeRuntime,
} from './runtime/desktopAppearanceThemeRuntime';

const {
  normalizeAppearanceMode,
  resolveAppearanceThemeSection,
  resolveEffectiveAppearanceTheme,
} = DesktopAppearanceThemeRuntime;

function applyThemeVariables(target, theme) {
  target.style.setProperty('--agent-accent', theme.accent);
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
    applyThemeVariables(target, resolveAppearanceThemeSection(config, effectiveTheme));
  };

  apply();

  if (preference !== 'system') {
    return () => {};
  }

  return subscribeToSystemTheme(matchMediaImpl, apply);
}
