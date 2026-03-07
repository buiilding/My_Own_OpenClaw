import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';

const CHAT_PILL_HIDE_SETTLE_MS = 120;

const linuxChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return true;
  },

  async collapseChatPillForBackgroundCapture(
    options: { waitMs?: number } = {},
  ): Promise<SurfaceCollapseResult> {
    // Full screenshot prep runs in Electron main so the hidden overlay renderer
    // cannot stretch either the pre-capture wait or the compositor settle delay.
    const result = await IpcBridge.invoke<{
      success?: boolean;
      reason?: string;
      waitMs?: number;
      settleMs?: number;
      waitTime?: number;
      hideInvokeTime?: number;
      settleTime?: number;
      hiddenSurface?: HiddenSurface;
    }>(INVOKE_CHANNELS.PREPARE_CHATBOX_FOR_SCREENSHOT, {
      waitMs: typeof options.waitMs === 'number' ? Math.max(0, options.waitMs) : 0,
      settleMs: CHAT_PILL_HIDE_SETTLE_MS,
      hideSurface: true,
    });
    if (result?.success !== true) {
      throw new Error(result?.reason || 'prepare-chatbox-for-screenshot failed');
    }
    return {
      collapsed: result?.hiddenSurface === 'chatbox' || result?.hiddenSurface === 'main-window',
      hiddenSurface: result?.hiddenSurface ?? 'none',
      timing: {
        waitTime: typeof result?.waitTime === 'number'
          ? Math.max(0, result.waitTime)
          : Math.max(0, (result?.waitMs ?? 0) / 1000),
        hideInvokeTime: typeof result?.hideInvokeTime === 'number'
          ? Math.max(0, result.hideInvokeTime)
          : 0,
        settleTime: typeof result?.settleTime === 'number'
          ? Math.max(0, result.settleTime)
          : Math.max(0, (result?.settleMs ?? CHAT_PILL_HIDE_SETTLE_MS) / 1000),
      },
    };
  },

  async restoreChatPillInactive(hiddenSurface: HiddenSurface = 'chatbox'): Promise<SurfaceRestoreResult> {
    const restoreStartTime = performance.now();
    if (hiddenSurface === 'main-window') {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, { focus: false });
    } else if (hiddenSurface === 'chatbox') {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    }
    return {
      restored: hiddenSurface !== 'none',
      restoredSurface: hiddenSurface,
      restoreInvokeTime: (performance.now() - restoreStartTime) / 1000,
    };
  },
};

export default linuxChatPillVisibilityRuntime;
