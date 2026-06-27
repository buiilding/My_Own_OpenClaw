/**
 * Covers renderer desktop chat event helpers.
 */

import {
  DesktopChatEventsRuntime,
} from '../../src/renderer/app/runtime/desktopChatEvents';

const {
  dispatchDesktopRuntimeNewChatEvent,
  subscribeDesktopRuntimeNewChatEvent,
} = DesktopChatEventsRuntime;

describe('desktopChatEvents', () => {
  test('dispatchDesktopRuntimeNewChatEvent emits the renderer new-chat event', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDesktopRuntimeNewChatEvent(listener);

    try {
      expect(dispatchDesktopRuntimeNewChatEvent()).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  test('subscribeDesktopRuntimeNewChatEvent removes its listener', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDesktopRuntimeNewChatEvent(listener);

    dispatchDesktopRuntimeNewChatEvent();
    unsubscribe();
    dispatchDesktopRuntimeNewChatEvent();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('helpers no-op when an event target is unavailable', () => {
    expect(dispatchDesktopRuntimeNewChatEvent(null)).toBe(false);
    const unsubscribe = subscribeDesktopRuntimeNewChatEvent(jest.fn(), null);
    expect(typeof unsubscribe).toBe('function');
    expect(unsubscribe).not.toThrow();
  });
});
