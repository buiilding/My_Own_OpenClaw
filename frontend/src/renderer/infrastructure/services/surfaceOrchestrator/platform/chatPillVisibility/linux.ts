import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  ChatPillCollapseResult,
  ChatPillRestoreResult,
} from '../../types';

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

  async collapseChatPillForBackgroundCapture(): Promise<ChatPillCollapseResult> {
    // Hide-only collapse avoids show->hide flashes when the pill is already hidden.
    const hideStartTime = performance.now();
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    const hideInvokeTime = (performance.now() - hideStartTime) / 1000;
    const settleStartTime = performance.now();
    await waitForChatPillHideSettlement();
    const settleTime = (performance.now() - settleStartTime) / 1000;
    return {
      collapsed: true,
      timing: {
        hideInvokeTime,
        settleTime,
      },
    };
  },

  async restoreChatPillInactive(): Promise<ChatPillRestoreResult> {
    const restoreStartTime = performance.now();
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    return {
      restored: true,
      restoreInvokeTime: (performance.now() - restoreStartTime) / 1000,
    };
  },
};

export default linuxChatPillVisibilityRuntime;
