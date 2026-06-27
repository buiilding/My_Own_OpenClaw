/**
 * Covers minimal chat pill appearance token behavior in the frontend suite.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readMinimalPillCssBlock() {
  const chatBoxCss = readRepoFile('src/renderer/styles/ChatBox.css');
  const blockStart = chatBoxCss.indexOf('.chatbox-pill {\n  --chatbox-close-button-size');
  const blockEnd = chatBoxCss.indexOf('\n}', blockStart);

  expect(blockStart).toBeGreaterThanOrEqual(0);
  expect(blockEnd).toBeGreaterThan(blockStart);

  return chatBoxCss.slice(blockStart, blockEnd);
}

describe('chat box appearance CSS', () => {
  test('routes the minimal pill close badge through theme tokens', () => {
    const chatBoxCss = readRepoFile('src/renderer/styles/ChatBox.css');

    expect(chatBoxCss).toContain('.chatbox-close-badge');
    expect(chatBoxCss).toContain('color: var(--chatbox-close-badge-fg);');
    expect(chatBoxCss).toContain('color: var(--chatbox-close-badge-hover-fg);');
    expect(chatBoxCss).toContain('background: var(--chatbox-close-badge-hover-bg);');
    expect(chatBoxCss).not.toContain('color: rgba(255, 255, 255, 0.94);');
  });

  test('keeps the close badge readable in light appearance', () => {
    const themeCss = readRepoFile('src/renderer/styles/theme.css');
    const lightThemeStart = themeCss.indexOf(":root[data-agent-theme='light']");
    const lightThemeEnd = themeCss.indexOf(":root[data-agent-translucent-sidebar='false']");
    const lightThemeBlock = themeCss.slice(lightThemeStart, lightThemeEnd);

    expect(lightThemeStart).toBeGreaterThanOrEqual(0);
    expect(lightThemeBlock).toContain('--chatbox-close-badge-fg: var(--appearance-foreground);');
    expect(lightThemeBlock).toContain('--chatbox-close-badge-hover-fg: var(--appearance-foreground);');
    expect(lightThemeBlock).toContain(
      '--chatbox-close-badge-hover-bg: color-mix(in srgb, var(--appearance-foreground) 10%, transparent 90%);',
    );
  });

  test('keeps pill caps rounded without ovalizing multiline growth', () => {
    const chatBoxCss = readRepoFile('src/renderer/styles/ChatBox.css');
    const pillBlock = readMinimalPillCssBlock();

    expect(pillBlock).toContain('--chatbox-close-bump-width: 44px;');
    expect(pillBlock).toContain('--chatbox-close-bump-height: var(--chatbox-bump-height);');
    expect(pillBlock).toContain('--chatbox-close-bump-bg: var(--ui-panel-bg);');
    expect(pillBlock).toContain('--chatbox-close-bump-outline: var(--ui-border);');
    expect(pillBlock).toContain('--chatbox-pill-body-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);');
    expect(pillBlock).toContain('--chatbox-pill-body-top-radius: 999px;');
    expect(pillBlock).toContain('--chatbox-pill-body-bottom-radius: 999px;');
    expect(pillBlock).toContain('var(--chatbox-pill-body-top-radius)');
    expect(pillBlock).toContain('var(--chatbox-pill-body-bottom-radius)');
    expect(pillBlock).toContain('background: transparent;');
    expect(pillBlock).toContain('overflow: visible;');
    expect(pillBlock).not.toContain('clip-path: polygon(');
    expect(chatBoxCss).toContain('.chatbox-pill.is-composer-expanded');
    expect(chatBoxCss).toContain('--chatbox-pill-body-top-radius: 32px;');
    expect(chatBoxCss).toContain('--chatbox-pill-body-bottom-radius: 28px;');
    expect(chatBoxCss).toContain('.chatbox-pill::before');
    expect(chatBoxCss).toContain('inset: var(--chatbox-bump-height) 0 0;');
    expect(chatBoxCss).toContain('z-index: 1;\n  border: 1px solid var(--ui-border);');
    expect(chatBoxCss).toContain('box-shadow: var(--chatbox-pill-body-shadow);');
    expect(chatBoxCss).toContain('.chatbox-pill::after');
    expect(chatBoxCss).toContain('width: var(--chatbox-close-bump-width);');
    expect(chatBoxCss).toContain('z-index: 0;');
    expect(chatBoxCss).toContain('background: var(--chatbox-close-bump-bg);');
    expect(chatBoxCss).toContain('border-radius: 0;');
    expect(chatBoxCss).toContain('clip-path: polygon(');
    expect(chatBoxCss).toContain('44% 6%,');
    expect(chatBoxCss).toContain('50% 4%,');
    expect(chatBoxCss).toContain('56% 6%,');
    expect(chatBoxCss).toContain('drop-shadow(0 -1px 0 var(--chatbox-close-bump-outline))');
    expect(chatBoxCss).not.toContain('.chatbox-close-badge::before');
    expect(chatBoxCss).not.toContain('--chatbox-close-bump-seam-');
  });

  test('anchors the response overlay close button outside the scrollable transcript', () => {
    const chatBoxCss = readRepoFile('src/renderer/styles/ChatBox.css');
    const overlaySource = readRepoFile(
      'src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx',
    );
    const frameBody = chatBoxCss.slice(
      chatBoxCss.indexOf('.chatbox-response-frame'),
      chatBoxCss.indexOf('.chatbox-response-pill', chatBoxCss.indexOf('.chatbox-response-frame')),
    );
    const closeBody = chatBoxCss.slice(
      chatBoxCss.indexOf('.chatbox-response-close'),
      chatBoxCss.indexOf('.chatbox-response-close:disabled'),
    );
    const frameIndex = overlaySource.indexOf('className="chatbox-response-frame"');
    const closeIndex = overlaySource.indexOf('className="chatbox-response-close"');
    const pillIndex = overlaySource.indexOf('className={`chatbox-response-pill');

    expect(frameBody).toContain('position: relative;');
    expect(closeBody).toContain('position: absolute;');
    expect(frameIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeGreaterThan(frameIndex);
    expect(pillIndex).toBeGreaterThan(closeIndex);
  });
});
