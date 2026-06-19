/**
 * WindieOS appearance defaults for the active renderer skin.
 */

export const DEFAULT_APPEARANCE_THEME = Object.freeze({
  light: Object.freeze({
    accent: '#339CFF',
    background: '#FFFFFF',
    foreground: '#1A1C1F',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 45,
  }),
  dark: Object.freeze({
    accent: '#339CFF',
    background: '#181818',
    foreground: '#FFFFFF',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 60,
  }),
});
