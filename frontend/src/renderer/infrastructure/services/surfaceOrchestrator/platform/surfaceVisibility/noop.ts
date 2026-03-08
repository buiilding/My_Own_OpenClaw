import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';
import {
  restoreSurfaceAfterBackgroundCaptureCore,
  suppressSurfaceForBackgroundCaptureCore,
} from './shared';

export function createNoopSurfaceVisibilityRuntime() {
  return {
    shouldManageSurfaceVisibilityForBackgroundCapture(): boolean {
      return true;
    },

    async suppressSurfaceForBackgroundCapture(
      options: { waitMs?: number } = {},
    ): Promise<SurfaceCollapseResult> {
      return suppressSurfaceForBackgroundCaptureCore({
        waitMs: options.waitMs,
        settleMs: 0,
        includeSettleTiming: false,
      });
    },

    async restoreSurfaceAfterBackgroundCapture(hiddenSurface: HiddenSurface = 'chatbox'): Promise<SurfaceRestoreResult> {
      return restoreSurfaceAfterBackgroundCaptureCore(hiddenSurface, { measureInvokeTime: false });
    },
  };
}
