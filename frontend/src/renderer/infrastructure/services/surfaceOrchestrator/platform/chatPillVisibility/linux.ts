import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';

const linuxChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return true;
  },

  async collapseChatPillForBackgroundCapture(): Promise<boolean> {
    // Hide-only collapse avoids show->hide flashes when the pill is already hidden.
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    return true;
  },

  async restoreChatPillInactive(): Promise<boolean> {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    return true;
  },
};

export default linuxChatPillVisibilityRuntime;
