import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';

export function createNoopSurfaceVisibilityRuntime() {
  return {
    shouldManageSurfaceVisibilityForBackgroundCapture(): boolean {
      return false;
    },

    async suppressSurfaceForBackgroundCapture(
      _options: { waitMs?: number } = {},
    ): Promise<SurfaceCollapseResult> {
      return {
        collapsed: false,
        hiddenSurface: 'none',
        timing: {
          waitTime: 0,
          hideInvokeTime: 0,
          settleTime: 0,
        },
      };
    },

    async restoreSurfaceAfterBackgroundCapture(_hiddenSurface: HiddenSurface = 'chatbox'): Promise<SurfaceRestoreResult> {
      return {
        restored: false,
        restoredSurface: 'none',
        restoreInvokeTime: 0,
      };
    },
  };
}
