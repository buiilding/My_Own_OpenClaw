/**
 * Covers desktop message list runtime behavior in the frontend test suite.
 */

import { DesktopMessageListRuntime } from '../../src/renderer/app/runtime/desktopMessageListRuntime';

describe('desktopMessageListRuntime', () => {
  const {
    clearScheduledMessageListScroll,
    observeMessageListResize,
    resolveCompactionStatusText,
    scheduleActiveFindMatchScroll,
    scheduleMessageListScrollToBottom,
    shouldAutoScrollForThinkingTextUpdate,
    shouldRenderAssistantActions,
    shouldRenderUserActions,
  } = DesktopMessageListRuntime;

  function createWindowApi() {
    let nextFrameId = 1;
    const frames = new Map();
    return {
      requestAnimationFrame: jest.fn((callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        frames.set(id, callback);
        return id;
      }),
      cancelAnimationFrame: jest.fn((id) => {
        frames.delete(id);
      }),
      runFrame(id) {
        frames.get(id)?.(0);
      },
      frames,
    };
  }

  function createResizeObserverCtor(instances) {
    return class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.disconnect = jest.fn();
        this.observe = jest.fn();
        instances.push(this);
      }
    };
  }

  test('resolveCompactionStatusText maps source event to status metadata', () => {
    expect(resolveCompactionStatusText('Compacting...', 'context-compaction-started')).toEqual(
      expect.objectContaining({ state: 'in-progress' }),
    );
    expect(resolveCompactionStatusText('Done', 'context-compaction-completed')).toEqual(
      expect.objectContaining({ state: 'completed' }),
    );
    expect(resolveCompactionStatusText('Failed', 'context-compaction-failed')).toEqual(
      expect.objectContaining({ state: 'failed' }),
    );
    expect(resolveCompactionStatusText('', 'context-compaction-failed')).toBeNull();
    expect(resolveCompactionStatusText('x', 'llm-thought')).toBeNull();
  });

  test('assistant/user action gating matches message type and role', () => {
    expect(shouldRenderAssistantActions({ sender: 'assistant', type: 'llm-text' }, true)).toBe(true);
    expect(shouldRenderAssistantActions({ sender: 'assistant', type: 'tool-call' }, true)).toBe(false);
    expect(shouldRenderAssistantActions({ sender: 'user', type: 'llm-text' }, true)).toBe(false);
    expect(shouldRenderUserActions({ sender: 'user' }, true)).toBe(true);
    expect(shouldRenderUserActions({ sender: 'assistant' }, true)).toBe(false);
    expect(shouldRenderUserActions({ sender: 'user' }, false)).toBe(false);
  });

  test('thinking-text auto-scroll requires same assistant llm-text row update', () => {
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking' }],
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking more' }],
    )).toBe(true);
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'tool-output', thinkingText: 'Thinking' }],
      [{ id: 'assistant-1', sender: 'assistant', type: 'tool-output', thinkingText: 'Thinking more' }],
    )).toBe(false);
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking' }],
      [{ id: 'assistant-2', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking more' }],
    )).toBe(false);
  });

  test('coalesces scheduled bottom scrolls through animation frame adapter', () => {
    const windowApi = createWindowApi();
    const element = {
      scrollHeight: 420,
      scrollTo: jest.fn(),
    };
    const frameRef = { current: null };
    const behaviorRef = { current: null };

    expect(scheduleMessageListScrollToBottom({
      elementRef: { current: element },
      frameRef,
      behaviorRef,
      behavior: 'smooth',
      windowApi,
    })).toBe(1);
    expect(scheduleMessageListScrollToBottom({
      elementRef: { current: element },
      frameRef,
      behaviorRef,
      behavior: 'auto',
      windowApi,
    })).toBe(1);
    expect(windowApi.requestAnimationFrame).toHaveBeenCalledTimes(1);

    windowApi.runFrame(1);
    expect(frameRef.current).toBeNull();
    expect(behaviorRef.current).toBeNull();
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'auto' });
  });

  test('clears scheduled bottom scroll animation frame', () => {
    const windowApi = createWindowApi();
    const frameRef = { current: 3 };
    const behaviorRef = { current: 'smooth' };

    expect(clearScheduledMessageListScroll({
      frameRef,
      behaviorRef,
      windowApi,
    })).toBe(true);

    expect(windowApi.cancelAnimationFrame).toHaveBeenCalledWith(3);
    expect(frameRef.current).toBeNull();
    expect(behaviorRef.current).toBeNull();
  });

  test('runs scheduled bottom scroll immediately without animation frame adapter', () => {
    const element = {
      scrollHeight: 360,
      scrollTop: 0,
    };
    const frameRef = { current: null };
    const behaviorRef = { current: null };

    expect(scheduleMessageListScrollToBottom({
      elementRef: { current: element },
      frameRef,
      behaviorRef,
      behavior: 'smooth',
      windowApi: {},
    })).toBeNull();

    expect(element.scrollTop).toBe(360);
    expect(frameRef.current).toBeNull();
    expect(behaviorRef.current).toBeNull();
  });

  test('schedules active find-match scroll and cancels cleanup through animation frame adapter', () => {
    const windowApi = createWindowApi();
    const activeMatchNode = {
      scrollIntoView: jest.fn(),
    };
    const messageListNode = {
      querySelector: jest.fn(() => activeMatchNode),
    };

    const cleanup = scheduleActiveFindMatchScroll({
      messageListRef: { current: messageListNode },
      activeFindMatchIndex: 2,
      windowApi,
    });

    expect(windowApi.requestAnimationFrame).toHaveBeenCalledTimes(1);
    windowApi.runFrame(1);
    expect(messageListNode.querySelector)
      .toHaveBeenCalledWith('[data-thread-find-match-index="2"]');
    expect(activeMatchNode.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
    });

    cleanup();
    expect(windowApi.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  test('observes message-list resize with injected ResizeObserver', () => {
    const instances = [];
    const ResizeObserverCtor = createResizeObserverCtor(instances);
    const element = {};
    const onResize = jest.fn();

    const cleanup = observeMessageListResize({
      elementRef: { current: element },
      onResize,
      resizeObserverCtor: ResizeObserverCtor,
    });

    expect(instances[0].observe).toHaveBeenCalledWith(element);
    instances[0].callback();
    expect(onResize).toHaveBeenCalledTimes(1);

    cleanup();
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  });
});
