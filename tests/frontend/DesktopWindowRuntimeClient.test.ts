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
  buildChatboxHitTestPayload,
  buildChatboxTextEntryActivationPayload,
  buildChatboxVisualAnchorHeightPayload,
  buildHideChatboxOptions,
  buildShowChatboxOptions,
  buildShowMainWindowOptions,
  resolveMainWindowOpenTarget,
} from '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient';

describe('DesktopWindowRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSend.mockReset();
    windowListener = null;
  });

  test('resolves main-window open target payloads at the runtime boundary', () => {
    expect(resolveMainWindowOpenTarget({ target: ' settings ' })).toBe('settings');
    expect(resolveMainWindowOpenTarget({ target: 12 })).toBe('');
    expect(resolveMainWindowOpenTarget(null)).toBe('');
  });

  test('builds chatbox visual anchor payloads at the runtime boundary', async () => {
    expect(buildChatboxVisualAnchorHeightPayload(92, 160)).toEqual({
      height: 92,
      frameHeight: 160,
    });
    expect(buildChatboxVisualAnchorHeightPayload('64.4', 0)).toEqual({
      height: 64,
    });

    await DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(72, 144);

    expect(mockInvoke).toHaveBeenCalledWith('set-chatbox-visual-anchor-height', {
      height: 72,
      frameHeight: 144,
    });
  });

  test('builds chatbox hit-test payloads at the runtime boundary', async () => {
    expect(buildChatboxHitTestPayload(true)).toEqual({ active: true });
    expect(buildChatboxHitTestPayload('true')).toEqual({ active: false });

    await DesktopWindowRuntimeClient.setChatboxHitTestActiveValue(true);

    expect(mockInvoke).toHaveBeenCalledWith('set-chatbox-hit-test-active', {
      active: true,
    });
  });

  test('builds window visibility command options at the runtime boundary', async () => {
    expect(buildShowChatboxOptions(false, ' startup ')).toEqual({
      focus: false,
      reason: 'startup',
    });
    expect(buildShowChatboxOptions('yes', '')).toEqual({});
    expect(buildHideChatboxOptions(' user ')).toEqual({ reason: 'user' });
    expect(buildHideChatboxOptions(12)).toEqual({});
    expect(buildShowMainWindowOptions(true, false, ' chat ', ' settings ')).toEqual({
      focus: true,
      maximize: false,
      open: 'chat',
      reason: 'settings',
    });

    await DesktopWindowRuntimeClient.showChatboxWithValues(false, 'restore');
    await DesktopWindowRuntimeClient.hideChatboxForReason('user');
    await DesktopWindowRuntimeClient.showMainWindowWithValues(null, true, 'chat', 'settings');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'show-chatbox', {
      focus: false,
      reason: 'restore',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'hide-chatbox', {
      reason: 'user',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'show-main-window', {
      maximize: true,
      open: 'chat',
      reason: 'settings',
    });
  });

  test('builds chatbox text-entry activation payloads at the runtime boundary', async () => {
    expect(buildChatboxTextEntryActivationPayload(' text-entry ')).toEqual({
      reason: 'text-entry',
    });
    expect(buildChatboxTextEntryActivationPayload(12)).toEqual({});

    await DesktopWindowRuntimeClient.activateChatboxTextEntryForReason('text-entry');

    expect(mockInvoke).toHaveBeenCalledWith('activate-chatbox-text-entry', {
      reason: 'text-entry',
    });
  });

  test('main-window open target subscriptions emit normalized target strings', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopWindowRuntimeClient.onMainWindowOpenTarget((event) => {
      events.push(event);
    });

    windowListener?.({ target: ' chat ' });

    expect(events).toEqual(['chat']);

    unsubscribe?.();
    expect(windowListener).toBeNull();
  });
});
