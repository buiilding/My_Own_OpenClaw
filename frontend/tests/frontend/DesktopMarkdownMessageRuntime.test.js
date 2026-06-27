/**
 * Covers desktop markdown message runtime behavior in the frontend test suite.
 */

import { DesktopMarkdownMessageRuntime } from '../../src/renderer/app/runtime/desktopMarkdownMessageRuntime';

describe('desktopMarkdownMessageRuntime', () => {
  const {
    buildMarkdownRenderModel,
  } = DesktopMarkdownMessageRuntime;

  test('builds sanitized markdown html and plain text for assistant messages', () => {
    const model = buildMarkdownRenderModel({
      text: 'Hello **alpha**',
      sender: 'assistant',
    });

    expect(model.html).toContain('<strong>alpha</strong>');
    expect(model.plainText.trim()).toBe('Hello alpha');
    expect(model.contract.markdown).toBe('Hello **alpha**');
  });

  test('enables math rendering only for assistant messages', () => {
    const assistantModel = buildMarkdownRenderModel({
      text: String.raw`\(\frac{n(n-1)}{2}\)`,
      sender: 'assistant',
    });
    const userModel = buildMarkdownRenderModel({
      text: String.raw`\(\frac{n(n-1)}{2}\)`,
      sender: 'user',
    });

    expect(assistantModel.html).toContain('class="katex');
    expect(assistantModel.contract.mathEnabled).toBe(true);
    expect(userModel.html).not.toContain('class="katex');
    expect(userModel.contract.mathEnabled).toBe(false);
  });
});
