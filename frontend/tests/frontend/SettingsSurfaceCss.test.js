/**
 * Covers settings surface CSS state-control behavior.
 */

import fs from 'node:fs';
import path from 'node:path';

function readSettingsSurfaceCss() {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/renderer/styles/SettingsSurface.css'),
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

  test('uses explicit disabled palettes for primary and secondary settings buttons', () => {
    const css = readSettingsSurfaceCss();
    const primaryDisabledBody = collectRuleBodies(css, String.raw`\.settings-surface-primary-button:disabled`);
    const secondaryDisabledBody = collectRuleBodies(css, String.raw`\.settings-surface-secondary-button:disabled`);

    expect(primaryDisabledBody).toEqual(expect.stringContaining('background: var(--ui-primary-button-disabled-bg);'));
    expect(primaryDisabledBody).toEqual(expect.stringContaining('border-color: var(--ui-primary-button-disabled-border);'));
    expect(primaryDisabledBody).toEqual(expect.stringContaining('color: var(--ui-primary-button-disabled-fg);'));
    expect(primaryDisabledBody).not.toEqual(expect.stringContaining('opacity:'));
    expect(secondaryDisabledBody).toEqual(expect.stringContaining('background: var(--ui-secondary-button-disabled-bg);'));
    expect(secondaryDisabledBody).toEqual(expect.stringContaining('border-color: var(--ui-secondary-button-disabled-border);'));
    expect(secondaryDisabledBody).toEqual(expect.stringContaining('color: var(--ui-secondary-button-disabled-fg);'));
    expect(secondaryDisabledBody).not.toEqual(expect.stringContaining('opacity:'));
  });

  test('keeps schema viewer JSON readable on dark debug panels in light appearance', () => {
    const css = readSettingsSurfaceCss();
    const panelBody = collectRuleBodies(css, String.raw`\.settings-surface-panel`);
    const schemaPreBody = collectRuleBodies(css, String.raw`\.settings-surface-schema-viewer pre`);

    expect(panelBody).toEqual(expect.stringContaining('--settings-schema-viewer-bg:'));
    expect(panelBody).toEqual(expect.stringContaining('--settings-schema-viewer-border:'));
    expect(panelBody).toEqual(expect.stringContaining('--settings-schema-viewer-fg: rgba(248, 250, 252, 0.92);'));
    expect(schemaPreBody).toEqual(expect.stringContaining('background: var(--settings-schema-viewer-bg);'));
    expect(schemaPreBody).toEqual(expect.stringContaining('color: var(--settings-schema-viewer-fg);'));
    expect(schemaPreBody).not.toEqual(expect.stringContaining('color: var(--ui-text-primary);'));
  });
});
