/**
 * Covers tool call rendering . behavior in the frontend test suite.
 */

import fs from 'node:fs';
import path from 'node:path';

function readChatInterfaceCss() {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/renderer/styles/ChatInterface.css'),
    'utf8',
  );
}

function collectRuleBodies(css, selector) {
  return [...css.matchAll(new RegExp(`[^{}]*${selector}[^{}]*\\{(?<body>[^}]+)\\}`, 'g'))]
    .map((match) => match.groups?.body || '')
    .join('\n');
}

describe('tool call rendering CSS', () => {
  test('keeps tool-call previews in the transcript flow instead of a nested scroll box', () => {
    const css = readChatInterfaceCss();
    const body = collectRuleBodies(css, String.raw`\.tool-call-content`);

    expect(body).toEqual(expect.stringContaining('max-height: none;'));
    expect(body).toEqual(expect.stringContaining('overflow-y: visible;'));
    expect(body).toEqual(expect.stringContaining('white-space: pre-wrap;'));
    expect(body).toEqual(expect.stringContaining('overflow-wrap: anywhere;'));
    expect(body).not.toEqual(expect.stringContaining('white-space: pre;'));
  });

  test('keeps dark tool card foregrounds independent from page theme text tokens', () => {
    const css = readChatInterfaceCss();
    const containerBody = collectRuleBodies(css, String.raw`\.tool-output-container,\s*\.tool-call-container`);
    const detailsButtonBody = collectRuleBodies(css, String.raw`\.tool-details-btn`);
    const contentBody = collectRuleBodies(css, String.raw`\.tool-output-content,\s*\.tool-call-content`);
    const detailsLabelBody = collectRuleBodies(css, String.raw`\.tool-details-label`);
    const detailsContentBody = collectRuleBodies(css, String.raw`\.tool-details-content`);
    const screenshotHeaderBody = collectRuleBodies(css, String.raw`\.tool-screenshot-header`);

    expect(containerBody).toEqual(expect.stringContaining('--tool-card-text:'));
    expect(containerBody).toEqual(expect.stringContaining('color: var(--tool-card-text);'));
    expect(detailsButtonBody).toEqual(expect.stringContaining('color: var(--tool-card-text);'));
    expect(contentBody).toEqual(expect.stringContaining('color: var(--tool-card-text);'));
    expect(detailsLabelBody).toEqual(expect.stringContaining('color: var(--tool-card-text-muted);'));
    expect(detailsContentBody).toEqual(expect.stringContaining('color: var(--tool-card-text);'));
    expect(screenshotHeaderBody).toEqual(expect.stringContaining('color: var(--tool-card-text-muted);'));
    expect(detailsButtonBody).not.toEqual(expect.stringContaining('color: var(--text-primary);'));
    expect(contentBody).not.toEqual(expect.stringContaining('color: var(--text-primary);'));
    expect(detailsContentBody).not.toEqual(expect.stringContaining('color: var(--text-primary);'));
  });

  test('uses readable light appearance text for dev source badges and transparency sections', () => {
    const css = readChatInterfaceCss();
    const sourceBadgeBody = collectRuleBodies(css, String.raw`:root\[data-agent-theme='light'\]\s*\.message-source-badge,\s*:root\[data-agent-theme='light'\]\s*\.thinking-source-badge`);
    const transparencyHeaderBody = collectRuleBodies(css, String.raw`:root\[data-agent-theme='light'\]\s*\.transparency-header`);
    const transparencyContentBody = collectRuleBodies(css, String.raw`:root\[data-agent-theme='light'\]\s*\.transparency-content-text,\s*:root\[data-agent-theme='light'\]\s*\.transparency-content-json`);

    expect(sourceBadgeBody).toEqual(expect.stringContaining('color: var(--appearance-foreground);'));
    expect(transparencyHeaderBody).toEqual(expect.stringContaining('color: var(--appearance-foreground);'));
    expect(transparencyContentBody).toEqual(expect.stringContaining('color: var(--appearance-foreground);'));
  });
});
