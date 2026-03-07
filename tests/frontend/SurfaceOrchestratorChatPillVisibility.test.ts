import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import * as chatPillVisibility from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/chatPillVisibility';

const {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
  shouldManageChatPillVisibilityForBackgroundCapture,
} = chatPillVisibility;

describe('surfaceOrchestrator chatPillVisibility', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true, hiddenSurface: 'chatbox' });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  test('collapses chat pill with deterministic hide-only ordering', async () => {
    (IpcBridge.invoke as jest.Mock).mockResolvedValueOnce({
      success: true,
      settleMs: 120,
      hiddenSurface: 'chatbox',
    });

    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(true);

    await expect(collapseChatPillForBackgroundCapture()).resolves.toEqual({
      collapsed: true,
      hiddenSurface: 'chatbox',
      timing: {
        waitTime: 0,
        hideInvokeTime: expect.any(Number),
        settleTime: 0.12,
      },
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);
  });

  test('restores chat pill as non-focusing show', async () => {
    await expect(restoreChatPillInactive()).resolves.toEqual({
      restored: true,
      restoredSurface: 'chatbox',
      restoreInvokeTime: expect.any(Number),
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('propagates collapse errors to caller for fail-closed handling', async () => {
    (IpcBridge.invoke as jest.Mock)
      .mockRejectedValueOnce(new Error('hide-failed'));

    await expect(collapseChatPillForBackgroundCapture()).rejects.toThrow('hide-failed');
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
    ]);
  });

  test('collapses and restores the active WindieOS surface outside Linux with compositor settle delay', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(true);

    await expect(collapseChatPillForBackgroundCapture()).resolves.toEqual({
      collapsed: true,
      hiddenSurface: 'chatbox',
      timing: {
        waitTime: 0,
        hideInvokeTime: expect.any(Number),
        settleTime: 0.12,
      },
    });
    await expect(restoreChatPillInactive()).resolves.toEqual({
      restored: true,
      restoredSurface: 'chatbox',
      restoreInvokeTime: 0,
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, { waitMs: 0, settleMs: 120, hideSurface: true }],
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });
});
