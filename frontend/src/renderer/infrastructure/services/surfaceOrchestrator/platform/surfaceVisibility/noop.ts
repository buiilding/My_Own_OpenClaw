import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';

export function createNoopSurfaceVisibilityRuntime() {
  return {
    shouldManageSurfaceVisibilityForBackgroundCapture(): boolean {
      return true;
    },

    async suppressSurfaceForBackgroundCapture(
      options: { waitMs?: number } = {},
    ): Promise<SurfaceCollapseResult> {
      const result = await IpcBridge.invoke<{
        success?: boolean;
        reason?: string;
        waitMs?: number;
        waitTime?: number;
        hideInvokeTime?: number;
        hiddenSurface?: HiddenSurface;
      }>(INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT, {
        waitMs: typeof options.waitMs === 'number' ? Math.max(0, options.waitMs) : 0,
        settleMs: 0,
        hideSurface: true,
      });
      if (result?.success !== true) {
        throw new Error(result?.reason || 'prepare-surface-for-screenshot failed');
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
          settleTime: 0,
        },
      };
    },

    async restoreSurfaceAfterBackgroundCapture(hiddenSurface: HiddenSurface = 'chatbox'): Promise<SurfaceRestoreResult> {
      if (hiddenSurface === 'main-window') {
        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, { focus: false });
      } else if (hiddenSurface === 'chatbox') {
        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      }
      return {
        restored: hiddenSurface !== 'none',
        restoredSurface: hiddenSurface,
        restoreInvokeTime: 0,
      };
    },
  };
}
