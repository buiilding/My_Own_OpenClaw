/**
 * Covers chat markdown appearance CSS behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectRuleBodies(css, selector) {
  return [...css.matchAll(new RegExp(`[^{}]*${selector}[^{}]*\\{(?<body>[^}]+)\\}`, 'g'))]
    .map((match) => match.groups?.body || '')
    .join('\n');
}

describe('chat markdown appearance CSS', () => {
  test('keeps markdown code blocks readable on their dark panel in light appearance', () => {
    const chatCss = readRepoFile('src/renderer/styles/ChatInterface.css');
    const lightChatBody = collectRuleBodies(chatCss, String.raw`:root\[data-agent-theme='light'\] \.chat-container`);
    const codeBlockBody = collectRuleBodies(chatCss, String.raw`\.message-content-markdown pre,`);
    const nestedCodeBody = collectRuleBodies(chatCss, String.raw`\.message-content-markdown pre code`);

    expect(lightChatBody).toContain('--chat-markdown-code-block-bg: rgba(11, 14, 20, 0.86);');
    expect(lightChatBody).toContain('--chat-markdown-code-block-border: rgba(226, 232, 240, 0.2);');
    expect(lightChatBody).toContain('--chat-markdown-code-block-text: #f8fafc;');
    expect(codeBlockBody).toContain('background: var(--chat-markdown-code-block-bg);');
    expect(codeBlockBody).toContain('border: 1px solid var(--chat-markdown-code-block-border);');
    expect(codeBlockBody).toContain('color: var(--chat-markdown-code-block-text);');
    expect(nestedCodeBody).toContain('color: inherit;');
  });
});
