/**
 * Covers markdown renderer. behavior in the frontend test suite.
 */

import {
  highlightPlainTextToHtml,
  highlightSanitizedHtml,
  toSanitizedMarkdownHtml,
} from '../../src/renderer/infrastructure/markdown';

describe('toSanitizedMarkdownHtml', () => {
  test('renders basic markdown', () => {
    const html = toSanitizedMarkdownHtml('Hello **world**');
    expect(html).toContain('<strong>world</strong>');
  });

  test('strips scripts and unsafe links', () => {
    const html = toSanitizedMarkdownHtml(
      ['<script>alert(1)</script>', '', '[x](javascript:alert(1))', '', '[ok](https://example.com)'].join(
        '\n'
      )
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('https://example.com');
  });

  test('renders fenced code blocks', () => {
    const html = toSanitizedMarkdownHtml(['```ts', 'console.log(1)', '```'].join('\n'));
    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    expect(html).toContain('console.log(1)');
  });

  test('adds safe link attributes', () => {
    const html = toSanitizedMarkdownHtml('[link](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  test('renders large markdown as escaped pre block', () => {
    const large = `<script>alert(1)</script>${'a'.repeat(40010)}`;
    const html = toSanitizedMarkdownHtml(large);
    expect(html).toContain('<pre class="code-block">');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('renders inline and block math when enabled', () => {
    const html = toSanitizedMarkdownHtml('Inline $x^2$ and block:\n\n$$\ny = mx + b\n$$', {
      enableMath: true,
    });
    expect(html).toContain('class="katex');
  });

  test('does not invoke math renderer when disabled', () => {
    const html = toSanitizedMarkdownHtml('Inline $x^2$', {
      enableMath: false,
    });
    expect(html.includes('class="katex')).toBe(false);
  });

  test('highlights rendered markdown text with stable match metadata', () => {
    const html = toSanitizedMarkdownHtml('Alpha **beta** alpha');
    const highlighted = highlightSanitizedHtml(html, 'alpha', [4, 9], 9);

    expect(highlighted).toContain('data-thread-find-match-index="4"');
    expect(highlighted).toContain('data-thread-find-match-index="9"');
    expect(highlighted).toContain('thread-find-match is-active');
    expect(highlighted).toContain('<strong>beta</strong>');
  });

  test('highlights plain text output without dropping escaped characters', () => {
    const highlighted = highlightPlainTextToHtml('<alpha> beta', 'alpha', [2], 2);

    expect(highlighted).toContain('&lt;');
    expect(highlighted).toContain('data-thread-find-match-index="2"');
    expect(highlighted).toContain('thread-find-match is-active');
  });
});
