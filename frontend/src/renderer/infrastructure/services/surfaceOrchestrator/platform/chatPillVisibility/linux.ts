import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';

const CHAT_PILL_HIDE_SETTLE_MS = 120;

function waitForChatPillHideSettlement(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, CHAT_PILL_HIDE_SETTLE_MS);
  });
}

const linuxChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return true;
  },

  async collapseChatPillForBackgroundCapture(): Promise<boolean> {
    // Hide-only collapse avoids show->hide flashes when the pill is already hidden.
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    await waitForChatPillHideSettlement();
    return true;
  },

  async restoreChatPillInactive(): Promise<boolean> {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    return true;
  },
};

export default linuxChatPillVisibilityRuntime;
