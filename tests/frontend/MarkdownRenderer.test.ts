import { toSanitizedMarkdownHtml } from '../../frontend/src/renderer/infrastructure/markdown';

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
});
