import React from 'react';
import {
  fireEvent,
  render,
} from '@testing-library/react';

import MessageList from '../../frontend/src/renderer/features/chat/components/MessageList';

function applyScrollMetrics(element, { scrollHeight, clientHeight, scrollTop }) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
    writable: true,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
    writable: true,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    value: scrollTop,
    writable: true,
  });
}

describe('MessageList auto-scroll behavior', () => {
  const scrollIntoView = jest.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
  });

  test('does not auto-scroll when user has scrolled away from bottom', () => {
    const { container, rerender } = render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working...', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    const list = container.querySelector('.message-list');
    expect(list).toBeTruthy();
    applyScrollMetrics(list, {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 300,
    });
    fireEvent.scroll(list);

    const callsBeforeUpdate = scrollIntoView.mock.calls.length;
    rerender(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working... more output', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(callsBeforeUpdate);
  });

  test('keeps auto-scroll when user remains near bottom', () => {
    const { container, rerender } = render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working...', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    const list = container.querySelector('.message-list');
    expect(list).toBeTruthy();
    applyScrollMetrics(list, {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 776,
    });
    fireEvent.scroll(list);

    const callsBeforeUpdate = scrollIntoView.mock.calls.length;
    rerender(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working... more output', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(callsBeforeUpdate);
  });
});
