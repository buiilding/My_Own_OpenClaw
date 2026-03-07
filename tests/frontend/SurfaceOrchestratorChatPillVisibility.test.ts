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
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true });
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
    });

    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(true);

    await expect(collapseChatPillForBackgroundCapture()).resolves.toEqual({
      collapsed: true,
      timing: {
        hideInvokeTime: expect.any(Number),
        settleTime: 0.12,
      },
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, { settleMs: 120 }],
    ]);
  });

  test('restores chat pill as non-focusing show', async () => {
    await expect(restoreChatPillInactive()).resolves.toEqual({
      restored: true,
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
      [INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, { settleMs: 120 }],
    ]);
  });

  test('skips collapse and restore chat pill IPC outside Linux', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(false);

    await expect(collapseChatPillForBackgroundCapture()).resolves.toEqual({
      collapsed: false,
      timing: {
        hideInvokeTime: 0,
        settleTime: 0,
      },
    });
    await expect(restoreChatPillInactive()).resolves.toEqual({
      restored: false,
      restoreInvokeTime: 0,
    });

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
  });
});
