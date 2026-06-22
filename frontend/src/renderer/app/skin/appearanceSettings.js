/**
 * WindieOS appearance defaults for the active renderer skin.
 */

export const DEFAULT_APPEARANCE_THEME = Object.freeze({
  light: Object.freeze({
    accent: '#339CFF',
    background: '#FFFFFF',
    foreground: '#4C4C4C',
    user_message_background: '#339CFF',
    user_message_foreground: '#FFFFFF',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 45,
  }),
  dark: Object.freeze({
    accent: '#339CFF',
    background: '#181818',
    foreground: '#FFFFFF',
    user_message_background: '#339CFF',
    user_message_foreground: '#FFFFFF',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 60,
  }),
});
