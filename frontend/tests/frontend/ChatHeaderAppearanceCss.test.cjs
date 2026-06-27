/**
 * Covers chat header appearance . behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chat header appearance CSS', () => {
  test('defines visible light-mode utility controls for the top-right header', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');
    const lightUtilityBlockStart = chatCss.indexOf(":root[data-agent-theme='light'] .chat-container");
    const lightUtilityBlockEnd = chatCss.indexOf('.chat-header', lightUtilityBlockStart);
    const lightUtilityBlock = chatCss.slice(lightUtilityBlockStart, lightUtilityBlockEnd);

    expect(lightUtilityBlockStart).toBeGreaterThanOrEqual(0);
    expect(lightUtilityBlock).toContain('--chat-utility-surface-bg: rgba(15, 23, 42, 0.07);');
    expect(lightUtilityBlock).toContain('--chat-utility-surface-border: rgba(15, 23, 42, 0.16);');
    expect(lightUtilityBlock).toContain('--chat-utility-text-primary: var(--appearance-foreground);');
    expect(lightUtilityBlock).toContain('--chat-utility-text-secondary: var(--appearance-foreground);');
    expect(lightUtilityBlock).toContain('--chat-utility-label-color: var(--appearance-foreground);');
    expect(lightUtilityBlock).toContain('--chat-top-icon-active-bg: color-mix(in srgb, var(--appearance-background) 88%, var(--appearance-foreground) 12%);');
    expect(lightUtilityBlock).toContain('--chat-top-icon-active-border: color-mix(in srgb, var(--appearance-foreground) 24%, transparent 76%);');
    expect(lightUtilityBlock).toContain('--chat-utility-panel-bg:');
  });

  test('routes browser, workspace, selector chevrons, and icon controls through readable light tokens', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');

    expect(chatCss).toContain('color: var(--chat-utility-label-color);');
    expect(chatCss).toContain('background: var(--chat-utility-surface-bg);');
    expect(chatCss).toContain('background: var(--chat-utility-surface-bg-muted);');
    expect(chatCss).toContain('color: var(--chat-utility-text-secondary);');
    expect(chatCss).toContain(":root[data-agent-theme='light'] .chat-provider-selector svg");
    expect(chatCss).toContain('color: var(--appearance-foreground);');
    expect(chatCss).toContain('background: var(--chat-top-icon-active-bg);');
    expect(chatCss).toContain('border-color: var(--chat-top-icon-active-border);');
    expect(chatCss).toContain('box-shadow: var(--chat-top-icon-active-shadow);');
  });

  test('routes user message pills through message-specific appearance tokens', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');

    expect(chatCss).toContain('background: var(--user-message-background);');
    expect(chatCss).toContain('color: var(--user-message-foreground);');
    expect(chatCss).toContain('.message-user .message-content-markdown a');
    expect(chatCss).toContain('text-decoration-color: color-mix(in srgb, var(--user-message-foreground) 72%, transparent 28%);');
    expect(chatCss).not.toContain('background: linear-gradient(180deg, var(--agent-accent) 0%, var(--agent-accent-hover) 100%)');
  });

  test('routes the inline user edit composer through readable light appearance tokens', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');
    const lightUtilityBlockStart = chatCss.indexOf(":root[data-agent-theme='light'] .chat-container");
    const lightUtilityBlockEnd = chatCss.indexOf('.chat-header', lightUtilityBlockStart);
    const lightUtilityBlock = chatCss.slice(lightUtilityBlockStart, lightUtilityBlockEnd);

    expect(lightUtilityBlockStart).toBeGreaterThanOrEqual(0);
    expect(lightUtilityBlock).toContain(
      '--user-message-editor-bg: color-mix(in srgb, var(--appearance-background) 94%, var(--appearance-foreground) 6%);',
    );
    expect(lightUtilityBlock).toContain(
      '--user-message-editor-border: color-mix(in srgb, var(--appearance-foreground) 18%, transparent 82%);',
    );
    expect(lightUtilityBlock).toContain('--user-message-editor-text: var(--appearance-foreground);');
    expect(lightUtilityBlock).toContain(
      '--user-message-editor-btn-bg: color-mix(in srgb, var(--appearance-background) 86%, var(--appearance-foreground) 14%);',
    );
    expect(lightUtilityBlock).toContain('--user-message-editor-btn-text: var(--appearance-foreground);');
    expect(chatCss).toContain('background: var(--user-message-editor-bg);');
    expect(chatCss).toContain('color: var(--user-message-editor-text);');
    expect(chatCss).toContain('background: var(--user-message-editor-btn-bg);');
    expect(chatCss).toContain('color: var(--user-message-editor-btn-text);');
  });

  test('routes message-list awaiting dots through readable light appearance tokens', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');
    const lightUtilityBlockStart = chatCss.indexOf(":root[data-agent-theme='light'] .chat-container");
    const lightUtilityBlockEnd = chatCss.indexOf('.chat-header', lightUtilityBlockStart);
    const lightUtilityBlock = chatCss.slice(lightUtilityBlockStart, lightUtilityBlockEnd);

    expect(lightUtilityBlockStart).toBeGreaterThanOrEqual(0);
    expect(lightUtilityBlock).toContain(
      '--chat-awaiting-dot-surface-bg: color-mix(in srgb, var(--appearance-foreground) 7%, var(--appearance-background) 93%);',
    );
    expect(lightUtilityBlock).toContain('--chat-awaiting-dot-border: color-mix(in srgb, var(--appearance-foreground) 18%, transparent 82%);');
    expect(lightUtilityBlock).toContain('--chat-awaiting-dot-bg: var(--appearance-foreground);');
    expect(chatCss).toContain('background: var(--chat-awaiting-dot-surface-bg);');
    expect(chatCss).toContain('border: 1px solid var(--chat-awaiting-dot-border);');
    expect(chatCss).toContain('background: var(--chat-awaiting-dot-bg);');
    expect(chatCss).not.toContain('background: rgba(255, 255, 255, 0.92);');
  });
});
