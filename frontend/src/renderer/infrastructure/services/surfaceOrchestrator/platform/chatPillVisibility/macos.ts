import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  ChatPillCollapseResult,
  ChatPillRestoreResult,
} from '../../types';

const macosChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return false;
  },

  async collapseChatPillForBackgroundCapture(
    options: { waitMs?: number } = {},
  ): Promise<ChatPillCollapseResult> {
    const result = await IpcBridge.invoke<{
      success?: boolean;
      reason?: string;
      waitMs?: number;
      waitTime?: number;
    }>(INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, {
      waitMs: typeof options.waitMs === 'number' ? Math.max(0, options.waitMs) : 0,
      settleMs: 0,
      hideChatbox: false,
    });
    if (result?.success !== true) {
      throw new Error(result?.reason || 'prepare-chatbox-for-screenshot failed');
    }
    return {
      collapsed: false,
      timing: {
        waitTime: typeof result?.waitTime === 'number'
          ? Math.max(0, result.waitTime)
          : Math.max(0, (result?.waitMs ?? 0) / 1000),
        hideInvokeTime: 0,
        settleTime: 0,
      },
    };
  },

  async restoreChatPillInactive(): Promise<ChatPillRestoreResult> {
    return {
      restored: false,
      restoreInvokeTime: 0,
    };
  },
};

export default macosChatPillVisibilityRuntime;
