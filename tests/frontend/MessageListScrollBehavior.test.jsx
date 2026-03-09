import React from 'react';
import {
  fireEvent,
  render,
} from '@testing-library/react';

import MessageList from '../../frontend/src/renderer/features/chat/components/MessageList';
import {
  shouldAutoScrollForAgentLoopMessageUpdate,
  shouldForceScrollForNewUserMessage,
} from '../../frontend/src/renderer/features/chat/utils/message/messageListState';

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
  const scrollTo = jest.fn();
  const resizeObserverInstances = [];

  beforeEach(() => {
    scrollIntoView.mockReset();
    scrollTo.mockReset();
    resizeObserverInstances.length = 0;
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
      writable: true,
    });
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        resizeObserverInstances.push(this);
      }

      observe() {}

      disconnect() {}
    };
  });

  test('does not auto-scroll when user has scrolled away from bottom', () => {
    const { container, rerender } = render(
      <MessageList
        enableAgentLoopAutoScroll
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
    const scrollToCallsBeforeUpdate = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working... more output', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(callsBeforeUpdate);
    expect(scrollTo).toHaveBeenCalledTimes(scrollToCallsBeforeUpdate);
  });

  test('keeps auto-scroll when user remains near bottom', () => {
    const { container, rerender } = render(
      <MessageList
        enableAgentLoopAutoScroll
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

    const scrollIntoViewCallsBeforeUpdate = scrollIntoView.mock.calls.length;
    const scrollToCallsBeforeUpdate = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'working... more output', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    const scrollToCallsAfterUpdate = scrollTo.mock.calls.slice(scrollToCallsBeforeUpdate);
    expect(scrollToCallsAfterUpdate.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterUpdate.every(([options]) => Number.isFinite(options?.top))).toBe(true);
    expect(scrollToCallsAfterUpdate.every(([options]) => options?.behavior === 'smooth')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(scrollIntoViewCallsBeforeUpdate);
  });

  test('forces auto-scroll when conversation selection changes', () => {
    const { container, rerender } = render(
      <MessageList
        conversationRef="conv-1"
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
      scrollTop: 260,
    });
    fireEvent.scroll(list);

    const scrollIntoViewCallsBeforeSwitch = scrollIntoView.mock.calls.length;
    const scrollToCallsBeforeSwitch = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        conversationRef="conv-2"
        messages={[
          { id: 'user-2', text: 'new conversation', sender: 'user', type: 'user' },
          { id: 'assistant-2', text: 'latest row', sender: 'assistant', type: 'llm-text' },
        ]}
      />,
    );

    const scrollToCallsAfterSwitch = scrollTo.mock.calls.slice(scrollToCallsBeforeSwitch);
    expect(scrollToCallsAfterSwitch.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterSwitch.every(([options]) => options?.behavior === 'auto')).toBe(true);
    expect(scrollToCallsAfterSwitch.some(([options]) => options?.top === 728)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(scrollIntoViewCallsBeforeSwitch);
  });

  test('auto-scrolls when a new user message is appended', () => {
    const { container, rerender } = render(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
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

    const scrollToCallsBeforeUpdate = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
          { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
        ]}
      />,
    );

    const scrollToCallsAfterUpdate = scrollTo.mock.calls.slice(scrollToCallsBeforeUpdate);
    expect(scrollToCallsAfterUpdate.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterUpdate.every(([options]) => Number.isFinite(options?.top))).toBe(true);
    expect(scrollToCallsAfterUpdate.every(([options]) => options?.behavior === 'auto')).toBe(true);
  });

  test('auto-scrolls when awaiting indicator appears after send while auto-follow is still enabled', () => {
    const messages = [
      { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
      { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
    ];
    const { container, rerender } = render(
      <MessageList
        enableAgentLoopAutoScroll
        messages={messages}
      />,
    );

    const list = container.querySelector('.message-list');
    expect(list).toBeTruthy();
    applyScrollMetrics(list, {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 800,
    });
    fireEvent.scroll(list);

    const scrollToCallsBeforeUpdate = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        enableAgentLoopAutoScroll
        messages={messages}
        awaitingDotTargetMessageId="user-2"
      />,
    );

    const scrollToCallsAfterUpdate = scrollTo.mock.calls.slice(scrollToCallsBeforeUpdate);
    expect(scrollToCallsAfterUpdate.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterUpdate.every(([options]) => Number.isFinite(options?.top))).toBe(true);
    expect(scrollToCallsAfterUpdate.every(([options]) => options?.behavior === 'auto')).toBe(true);
  });

  test('keeps auto-follow enabled when content grows without an upward scroll', () => {
    const { container, rerender } = render(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
          { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
        ]}
      />,
    );

    const list = container.querySelector('.message-list');
    expect(list).toBeTruthy();
    applyScrollMetrics(list, {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 800,
    });
    fireEvent.scroll(list);

    applyScrollMetrics(list, {
      scrollHeight: 1260,
      clientHeight: 400,
      scrollTop: 800,
    });
    fireEvent.scroll(list);

    const scrollToCallsBeforeUpdate = scrollTo.mock.calls.length;
    rerender(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
          { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
          { id: 'tool-call-1', text: '{"name":"tool"}', sender: 'assistant', type: 'tool-call' },
        ]}
      />,
    );

    const scrollToCallsAfterUpdate = scrollTo.mock.calls.slice(scrollToCallsBeforeUpdate);
    expect(scrollToCallsAfterUpdate.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterUpdate.every(([options]) => Number.isFinite(options?.top))).toBe(true);
  });

  test('auto-scrolls when resize observer detects late content growth while follow mode is active', () => {
    const { container } = render(
      <MessageList
        enableAgentLoopAutoScroll
        messages={[
          { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
          { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
        ]}
      />,
    );

    const list = container.querySelector('.message-list');
    expect(list).toBeTruthy();
    applyScrollMetrics(list, {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 800,
    });
    fireEvent.scroll(list);

    const resizeObserver = resizeObserverInstances[0];
    expect(resizeObserver).toBeTruthy();

    const scrollToCallsBeforeResize = scrollTo.mock.calls.length;
    applyScrollMetrics(list, {
      scrollHeight: 1280,
      clientHeight: 400,
      scrollTop: 800,
    });
    resizeObserver.callback();

    const scrollToCallsAfterResize = scrollTo.mock.calls.slice(scrollToCallsBeforeResize);
    expect(scrollToCallsAfterResize.length).toBeGreaterThan(0);
    expect(scrollToCallsAfterResize.every(([options]) => Number.isFinite(options?.top))).toBe(true);
  });
});

describe('shouldAutoScrollForAgentLoopMessageUpdate', () => {
  test('returns true for appended tool rows', () => {
    expect(shouldAutoScrollForAgentLoopMessageUpdate(
      [{ id: 'user-1', text: 'hello', sender: 'user', type: 'user' }],
      [
        { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        { id: 'tool-call-1', text: '{"name":"tool"}', sender: 'assistant', type: 'tool-call' },
      ],
    )).toBe(true);
    expect(shouldAutoScrollForAgentLoopMessageUpdate(
      [{ id: 'tool-call-1', text: '{"name":"tool"}', sender: 'assistant', type: 'tool-call' }],
      [
        { id: 'tool-call-1', text: '{"name":"tool"}', sender: 'assistant', type: 'tool-call' },
        { id: 'tool-output-1', text: '{"ok":true}', sender: 'assistant', type: 'tool-output' },
      ],
    )).toBe(true);
  });

  test('returns true for streaming assistant text updates', () => {
    expect(shouldAutoScrollForAgentLoopMessageUpdate(
      [{ id: 'assistant-1', text: 'hel', sender: 'assistant', type: 'llm-text', isComplete: false }],
      [{ id: 'assistant-1', text: 'hello', sender: 'assistant', type: 'llm-text', isComplete: false }],
    )).toBe(true);
  });

  test('returns false for non-agent-loop message changes', () => {
    expect(shouldAutoScrollForAgentLoopMessageUpdate(
      [{ id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' }],
      [
        { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
        { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
      ],
    )).toBe(false);
  });
});

describe('shouldForceScrollForNewUserMessage', () => {
  test('returns true for appended user rows', () => {
    expect(shouldForceScrollForNewUserMessage(
      [{ id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' }],
      [
        { id: 'assistant-1', text: 'done', sender: 'assistant', type: 'llm-text' },
        { id: 'user-2', text: 'follow-up', sender: 'user', type: 'user' },
      ],
    )).toBe(true);
  });

  test('returns false when no new user row was appended', () => {
    expect(shouldForceScrollForNewUserMessage(
      [{ id: 'user-1', text: 'hello', sender: 'user', type: 'user' }],
      [{ id: 'user-1', text: 'hello', sender: 'user', type: 'user' }],
    )).toBe(false);
    expect(shouldForceScrollForNewUserMessage(
      [{ id: 'user-1', text: 'hello', sender: 'user', type: 'user' }],
      [
        { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        { id: 'tool-call-1', text: '{}', sender: 'assistant', type: 'tool-call' },
      ],
    )).toBe(false);
  });
});
