import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  ChatPillCollapseResult,
  ChatPillRestoreResult,
} from '../../types';

const CHAT_PILL_HIDE_SETTLE_MS = 120;

const linuxChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return true;
  },

  async collapseChatPillForBackgroundCapture(): Promise<ChatPillCollapseResult> {
    // Hide-and-settle now runs in Electron main so the hidden overlay renderer
    // cannot stretch the delay via background timer throttling.
    const hideStartTime = performance.now();
    const result = await IpcBridge.invoke<{
      success?: boolean;
      reason?: string;
      settleMs?: number;
    }>(INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, {
      settleMs: CHAT_PILL_HIDE_SETTLE_MS,
    });
    if (result?.success !== true) {
      throw new Error(result?.reason || 'prepare-chatbox-for-screenshot failed');
    }
    const totalPreparationTime = (performance.now() - hideStartTime) / 1000;
    const settleTime = Math.max(0, (result?.settleMs ?? CHAT_PILL_HIDE_SETTLE_MS) / 1000);
    const hideInvokeTime = Math.max(0, totalPreparationTime - settleTime);
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
