/**
 * Covers renderer theme token CSS behavior.
 */

import fs from 'node:fs';
import path from 'node:path';

function readThemeCss() {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/renderer/styles/theme.css'),
    'utf8',
  );
}

function collectRuleBodies(css, selector) {
  return [...css.matchAll(new RegExp(`[^{}]*${selector}[^{}]*\\{(?<body>[^}]+)\\}`, 'g'))]
    .map((match) => match.groups?.body || '')
    .join('\n');
}

describe('theme CSS', () => {
  test('keeps light appearance primary and secondary UI text on the readable foreground token', () => {
    const css = readThemeCss();
    const lightThemeBody = collectRuleBodies(css, String.raw`:root\[data-agent-theme='light'\]`);

    expect(lightThemeBody).toEqual(expect.stringContaining('--text-primary: var(--appearance-foreground);'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-text-primary: var(--appearance-foreground);'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-text-secondary: var(--appearance-foreground);'));
    expect(lightThemeBody).not.toEqual(expect.stringContaining('--ui-text-secondary: color-mix(in srgb, var(--appearance-foreground)'));
  });

  test('defines user message and settings state-control theme tokens', () => {
    const css = readThemeCss();
    const rootBody = collectRuleBodies(css, String.raw`:root`);
    const lightThemeBody = collectRuleBodies(css, String.raw`:root\[data-agent-theme='light'\]`);

    expect(rootBody).toEqual(expect.stringContaining('--user-message-background: #339CFF;'));
    expect(rootBody).toEqual(expect.stringContaining('--user-message-foreground: #ffffff;'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-toggle-track-off:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-toggle-track-on:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-toggle-track-disabled:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-primary-button-disabled-bg:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-secondary-button-disabled-bg:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-danger-bg:'));
    expect(rootBody).toEqual(expect.stringContaining('--ui-danger-disabled-fg:'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-toggle-thumb-off: var(--appearance-foreground);'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-primary-button-disabled-fg: color-mix(in srgb, var(--appearance-foreground)'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-secondary-button-disabled-fg: color-mix(in srgb, var(--appearance-foreground)'));
    expect(lightThemeBody).toEqual(expect.stringContaining('--ui-danger-fg: #9f2418;'));
  });
});
