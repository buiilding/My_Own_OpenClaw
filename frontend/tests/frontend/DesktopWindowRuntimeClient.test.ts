/**
 * Covers desktop window runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
const mockSend = jest.fn();
let windowListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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

import * as DesktopWindowRuntimeModule from '../../src/renderer/app/runtime/desktopWindowRuntimeClient';
import { DesktopWindowRuntimeClient } from '../../src/renderer/app/runtime/desktopWindowRuntimeClient';

describe('DesktopWindowRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSend.mockReset();
    windowListener = null;
  });

  test('keeps raw window command helpers private to the runtime client', () => {
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('resolveMainWindowOpenTarget');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildShowChatboxOptions');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildHideChatboxOptions');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildShowMainWindowOptions');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildChatboxVisualAnchorHeightPayload');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildChatboxHitTestPayload');
    expect(DesktopWindowRuntimeModule).not.toHaveProperty('buildChatboxTextEntryActivationPayload');
  });

  test('builds chatbox visual anchor payloads at the runtime boundary', async () => {
    await DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(92, 160);
    await DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue('64.4', 0);
    await DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(72, 144);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'set-chatbox-visual-anchor-height', {
      height: 92,
      frameHeight: 160,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'set-chatbox-visual-anchor-height', {
      height: 64,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'set-chatbox-visual-anchor-height', {
      height: 72,
      frameHeight: 144,
    });
  });

  test('builds chatbox hit-test payloads at the runtime boundary', async () => {
    await DesktopWindowRuntimeClient.setChatboxHitTestActiveValue(true);
    await DesktopWindowRuntimeClient.setChatboxHitTestActiveValue('true');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'set-chatbox-hit-test-active', {
      active: true,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'set-chatbox-hit-test-active', {
      active: false,
    });
  });

  test('builds window visibility command options at the runtime boundary', async () => {
    await DesktopWindowRuntimeClient.showChatboxWithValues(false, ' startup ');
    await DesktopWindowRuntimeClient.showChatboxWithValues('yes', '');
    await DesktopWindowRuntimeClient.hideChatboxForReason(' user ');
    await DesktopWindowRuntimeClient.hideChatboxForReason(12);
    await DesktopWindowRuntimeClient.showMainWindowWithValues(true, false, ' chat ', ' settings ');
    await DesktopWindowRuntimeClient.showChatboxWithValues(false, 'restore');
    await DesktopWindowRuntimeClient.hideChatboxForReason('user');
    await DesktopWindowRuntimeClient.showMainWindowWithValues(null, true, 'chat', 'settings');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'show-chatbox', {
      focus: false,
      reason: 'startup',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'show-chatbox', {});
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'hide-chatbox', {
      reason: 'user',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'hide-chatbox', {});
    expect(mockInvoke).toHaveBeenNthCalledWith(5, 'show-main-window', {
      focus: true,
      maximize: false,
      open: 'chat',
      reason: 'settings',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(6, 'show-chatbox', {
      focus: false,
      reason: 'restore',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(7, 'hide-chatbox', {
      reason: 'user',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(8, 'show-main-window', {
      maximize: true,
      open: 'chat',
      reason: 'settings',
    });
  });

  test('builds chatbox text-entry activation payloads at the runtime boundary', async () => {
    await DesktopWindowRuntimeClient.activateChatboxTextEntryForReason(' text-entry ');
    await DesktopWindowRuntimeClient.activateChatboxTextEntryForReason(12);
    await DesktopWindowRuntimeClient.activateChatboxTextEntryForReason('text-entry');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'activate-chatbox-text-entry', {
      reason: 'text-entry',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'activate-chatbox-text-entry', {});
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'activate-chatbox-text-entry', {
      reason: 'text-entry',
    });
  });

  test('main-window open target subscriptions emit normalized target strings', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopWindowRuntimeClient.onMainWindowOpenTarget((event) => {
      events.push(event);
    });

    windowListener?.({ target: ' chat ' });
    windowListener?.({ target: 12 });
    windowListener?.(null);

    expect(events).toEqual(['chat', '', '']);

    unsubscribe?.();
    expect(windowListener).toBeNull();
  });
});
