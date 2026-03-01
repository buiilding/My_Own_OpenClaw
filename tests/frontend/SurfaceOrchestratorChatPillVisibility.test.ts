import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/chatPillVisibility';

describe('surfaceOrchestrator chatPillVisibility', () => {
  beforeEach(() => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('collapses chat pill with deterministic hide-only ordering', async () => {
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
});
