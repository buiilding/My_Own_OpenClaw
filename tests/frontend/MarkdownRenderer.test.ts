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
});
