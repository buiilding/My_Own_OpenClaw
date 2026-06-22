/**
 * Covers settings surface CSS state-control behavior.
 */

import fs from 'node:fs';
import path from 'node:path';

function readSettingsSurfaceCss() {
  return fs.readFileSync(
    path.join(process.cwd(), '../frontend/src/renderer/styles/SettingsSurface.css'),
    'utf8',
  );
}

function collectRuleBodies(css, selector) {
  return [...css.matchAll(new RegExp(`[^{}]*${selector}[^{}]*\\{(?<body>[^}]+)\\}`, 'g'))]
    .map((match) => match.groups?.body || '')
    .join('\n');
}

describe('settings surface CSS', () => {
  test('uses explicit toggle state tokens instead of opacity-only disabled styling', () => {
    const css = readSettingsSurfaceCss();
    const toggleBody = collectRuleBodies(css, String.raw`\.settings-surface-toggle`);
    const checkedBody = collectRuleBodies(css, String.raw`\.settings-surface-toggle\.checked`);
    const disabledBody = collectRuleBodies(css, String.raw`\.settings-surface-toggle:has\(input:disabled\)`);
    const thumbBody = collectRuleBodies(css, String.raw`\.settings-surface-toggle-thumb`);

    expect(toggleBody).toEqual(expect.stringContaining('border: 1px solid var(--ui-toggle-border-off);'));
    expect(toggleBody).toEqual(expect.stringContaining('background: var(--ui-toggle-track-off);'));
    expect(checkedBody).toEqual(expect.stringContaining('background: var(--ui-toggle-track-on);'));
    expect(checkedBody).toEqual(expect.stringContaining('border-color: var(--ui-toggle-border-on);'));
    expect(disabledBody).toEqual(expect.stringContaining('background: var(--ui-toggle-track-disabled);'));
    expect(disabledBody).toEqual(expect.stringContaining('border-color: var(--ui-toggle-border-disabled);'));
    expect(disabledBody).not.toEqual(expect.stringContaining('opacity:'));
    expect(thumbBody).toEqual(expect.stringContaining('background: var(--ui-toggle-thumb-off);'));
  });

  test('uses shared danger tokens for destructive settings buttons', () => {
    const css = readSettingsSurfaceCss();
    const dangerBody = collectRuleBodies(css, String.raw`\.settings-surface-danger-button`);
    const dangerDisabledBody = collectRuleBodies(css, String.raw`\.settings-surface-danger-button:disabled`);

    expect(dangerBody).toEqual(expect.stringContaining('border: 1px solid var(--ui-danger-border);'));
    expect(dangerBody).toEqual(expect.stringContaining('background: var(--ui-danger-bg);'));
    expect(dangerBody).toEqual(expect.stringContaining('color: var(--ui-danger-fg);'));
    expect(dangerDisabledBody).toEqual(expect.stringContaining('background: var(--ui-danger-disabled-bg);'));
    expect(dangerDisabledBody).toEqual(expect.stringContaining('border-color: var(--ui-danger-disabled-border);'));
    expect(dangerDisabledBody).toEqual(expect.stringContaining('color: var(--ui-danger-disabled-fg);'));
    expect(dangerDisabledBody).not.toEqual(expect.stringContaining('opacity:'));
  });
});
