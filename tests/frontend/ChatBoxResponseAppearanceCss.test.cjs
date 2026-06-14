/**
 * Covers chat box response appearance . behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chatbox response appearance CSS', () => {
  test('defines light-mode typing indicator tokens with visible dots', () => {
    const css = readRepoFile('frontend/src/renderer/styles/ChatBoxResponseOverlay.css');
    const lightBlockStart = css.indexOf(":root[data-windie-theme='light'] .chatbox-response-shell-wrap");
    const lightBlockEnd = css.indexOf('.chatbox-response-shell-wrap.awaiting-only', lightBlockStart);
    const lightBlock = css.slice(lightBlockStart, lightBlockEnd);

    expect(lightBlockStart).toBeGreaterThanOrEqual(0);
    expect(lightBlock).toContain('--chatbox-typing-surface-bg: rgba(15, 23, 42, 0.07);');
    expect(lightBlock).toContain('--chatbox-typing-border: rgba(15, 23, 42, 0.18);');
    expect(lightBlock).toContain('--chatbox-typing-dot-bg: rgba(15, 23, 42, 0.74);');
  });

  test('routes awaiting indicator paint through typing tokens', () => {
    const css = readRepoFile('frontend/src/renderer/styles/ChatBoxResponseOverlay.css');

    expect(css).toContain('background: var(--chatbox-typing-surface-bg);');
    expect(css).toContain('border: 1px solid var(--chatbox-typing-border);');
    expect(css).toContain('background: var(--chatbox-typing-dot-bg);');
  });
});
