/**
 * Covers desktop window runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
const mockSend = jest.fn();
let windowListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    send: (...args: unknown[]) => mockSend(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      windowListener = listener;
      return () => {
        windowListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    SHOW_CHATBOX: 'show-chatbox',
    HIDE_CHATBOX: 'hide-chatbox',
    SHOW_MAIN_WINDOW: 'show-main-window',
    SET_CHATBOX_VISUAL_ANCHOR_HEIGHT: 'set-chatbox-visual-anchor-height',
    ACTIVATE_CHATBOX_TEXT_ENTRY: 'activate-chatbox-text-entry',
    SET_CHATBOX_HIT_TEST_ACTIVE: 'set-chatbox-hit-test-active',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
  },
  ON_CHANNELS: {
    CHATBOX_FOCUS: 'chatbox-focus',
    WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger',
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
  },
  SEND_CHANNELS: {
    MOVE_CHATBOX_TO: 'move-chatbox-to',
  },
}));

import {
  DesktopWindowRuntimeClient,
  normalizeMainWindowOpenTargetPayload,
} from '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient';

describe('DesktopWindowRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSend.mockReset();
    windowListener = null;
  });

  test('normalizes main-window open target payloads at the runtime boundary', () => {
    expect(normalizeMainWindowOpenTargetPayload({ target: ' settings ' })).toEqual({
      target: 'settings',
    });
    expect(normalizeMainWindowOpenTargetPayload({ target: 12 })).toEqual({
      target: '',
    });
    expect(normalizeMainWindowOpenTargetPayload(null)).toEqual({
      target: '',
    });
  });

  test('main-window open target subscriptions emit normalized payloads', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopWindowRuntimeClient.onMainWindowOpenTarget((event) => {
      events.push(event);
    });

    windowListener?.({ target: ' chat ' });

    expect(events).toEqual([{ target: 'chat' }]);

    unsubscribe?.();
    expect(windowListener).toBeNull();
  });
});
