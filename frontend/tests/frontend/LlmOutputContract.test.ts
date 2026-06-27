/**
 * Covers llm output contract. behavior in the frontend test suite.
 */

import { resolveLlmOutputContract } from '../../src/renderer/infrastructure/llmOutputContract';

describe('resolveLlmOutputContract', () => {
  test('keeps plain markdown output by default', () => {
    const contract = resolveLlmOutputContract('Hello **world**');
    expect(contract.source).toBe('markdown');
    expect(contract.markdown).toBe('Hello **world**');
    expect(contract.mathEnabled).toBe(true);
  });

  test('parses structured JSON payload into markdown content', () => {
    const contract = resolveLlmOutputContract(
      JSON.stringify({
        blocks: [
          { type: 'heading', level: 2, text: 'Result' },
          { type: 'paragraph', text: 'Use this output.' },
          { type: 'list', items: ['A', 'B'] },
        ],
      }),
    );
    expect(contract.source).toBe('structured-json');
    expect(contract.markdown.includes('## Result')).toBe(true);
    expect(contract.markdown.includes('Use this output.')).toBe(true);
    expect(contract.markdown.includes('- A')).toBe(true);
  });

  test('normalizes escaped transport delimiters and newlines', () => {
    const contract = resolveLlmOutputContract(
      'Equation: \\\\(a_1 + a_2\\\\)\\\\nAnd set: \\\\[x^2 + y^2 = 1\\\\]',
    );
    expect(contract.markdown.includes('a_1 + a_2')).toBe(true);
    expect(contract.markdown.includes('x^2 + y^2 = 1')).toBe(true);
    expect(contract.markdown.includes('\\(')).toBe(false);
    expect(contract.markdown.includes('\\[')).toBe(false);
    expect(contract.markdown.includes('\nAnd set:')).toBe(true);
  });

  test('normalizes latex delimiters for assistant output', () => {
    const contract = resolveLlmOutputContract(
      [
        'Compare this:',
        String.raw`\[`,
        String.raw`\frac{n(n-1)}{2} \le n^2`,
        String.raw`\]`,
        '',
        String.raw`Inline: \(\alpha + \beta\)`,
      ].join('\n'),
    );

    expect(contract.markdown.includes(String.raw`\[`)).toBe(false);
    expect(contract.markdown.includes(String.raw`\(`)).toBe(false);
    expect(contract.markdown.includes('$$')).toBe(true);
    expect(contract.markdown.includes(String.raw`$\alpha + \beta$`)).toBe(true);
    expect(contract.markdown.includes(String.raw`\frac{n(n-1)}{2} \le n^2`)).toBe(true);
  });

  test('preserves latex delimiters when math rendering is disabled', () => {
    const contract = resolveLlmOutputContract(
      String.raw`Use \(x + 1\) and \[y + 2\] literally.`,
      { enableMath: false },
    );

    expect(contract.mathEnabled).toBe(false);
    expect(contract.markdown).toBe(String.raw`Use \(x + 1\) and \[y + 2\] literally.`);
  });

  test('preserves latex delimiters inside fenced code blocks', () => {
    const contract = resolveLlmOutputContract(
      [
        '```tex',
        String.raw`\[x^2\]`,
        '```',
        '',
        String.raw`Outside \(\gamma\)`,
      ].join('\n'),
    );

    expect(contract.markdown.includes('```tex')).toBe(true);
    expect(contract.markdown.includes(String.raw`\[x^2\]`)).toBe(true);
    expect(contract.markdown.includes(String.raw`Outside $\gamma$`)).toBe(true);
  });

  test('strips accidental wrapper html tokens for transport outputs', () => {
    const contract = resolveLlmOutputContract(
      '<div><p>Hello world</p></div>',
    );
    expect(contract.markdown).toBe('Hello world');
  });
});
