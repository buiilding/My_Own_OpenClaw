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
    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(true);

    await collapseChatPillForBackgroundCapture();

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
    ]);
  });

  test('restores chat pill as non-focusing show', async () => {
    await restoreChatPillInactive();

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false }],
    ]);
  });

  test('propagates collapse errors to caller for fail-closed handling', async () => {
    (IpcBridge.invoke as jest.Mock)
      .mockRejectedValueOnce(new Error('hide-failed'));

    await expect(collapseChatPillForBackgroundCapture()).rejects.toThrow('hide-failed');
    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([
      [INVOKE_CHANNELS.HIDE_CHATBOX],
    ]);
  });

  test('skips collapse and restore chat pill IPC outside Linux', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    expect(shouldManageChatPillVisibilityForBackgroundCapture()).toBe(false);

    await collapseChatPillForBackgroundCapture();
    await restoreChatPillInactive();

    expect((IpcBridge.invoke as jest.Mock).mock.calls).toEqual([]);
  });
});
