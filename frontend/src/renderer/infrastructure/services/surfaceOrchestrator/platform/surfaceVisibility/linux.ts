import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';
import {
  restoreSurfaceAfterBackgroundCaptureCore,
  suppressSurfaceForBackgroundCaptureCore,
} from './shared';

const CHAT_PILL_HIDE_SETTLE_MS = 120;

const linuxSurfaceVisibilityRuntime = {
  shouldManageSurfaceVisibilityForBackgroundCapture(): boolean {
    return true;
  },

  async suppressSurfaceForBackgroundCapture(
    options: { waitMs?: number } = {},
  ): Promise<SurfaceCollapseResult> {
    return suppressSurfaceForBackgroundCaptureCore({
      waitMs: options.waitMs,
      settleMs: CHAT_PILL_HIDE_SETTLE_MS,
      includeSettleTiming: true,
    });
  },

  async restoreSurfaceAfterBackgroundCapture(hiddenSurface: HiddenSurface = 'chatbox'): Promise<SurfaceRestoreResult> {
    return restoreSurfaceAfterBackgroundCaptureCore(hiddenSurface, { measureInvokeTime: true });
  },
};

export default linuxSurfaceVisibilityRuntime;
