/**
 * Covers markdown message. behavior in the frontend test suite.
 */

import React from 'react';
import { render } from '@testing-library/react';

import MarkdownMessage from '../../src/renderer/features/chat/components/message/content/MarkdownMessage';

describe('MarkdownMessage', () => {
  test('renders latex math for assistant messages without provider context', () => {
    const { container } = render(
      <MarkdownMessage
        text={[
          'The maximum number of edges is',
          String.raw`\[`,
          String.raw`\frac{n(n-1)}{2}`,
          String.raw`\]`,
        ].join('\n')}
        sender="assistant"
      />,
    );

    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.textContent).toContain('n(n−1)');
  });
});
