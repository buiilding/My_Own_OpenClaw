/**
 * Provides the shared module for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../../../ipc/bridge';
import type {
  HiddenSurface,
  SurfaceCollapseResult,
  SurfaceRestoreResult,
} from '../../types';

type PrepareSurfaceResult = {
  success?: boolean;
  reason?: string;
  waitMs?: number;
  settleMs?: number;
  waitTime?: number;
  hideInvokeTime?: number;
  settleTime?: number;
  hiddenSurface?: HiddenSurface;
};

function normalizeWaitMs(waitMs: number | undefined): number {
  return typeof waitMs === 'number' && Number.isFinite(waitMs)
    ? Math.max(0, waitMs)
    : 0;
}

function toSeconds(
  valueInSeconds: number | undefined,
  fallbackMs: number,
): number {
  if (typeof valueInSeconds === 'number' && Number.isFinite(valueInSeconds)) {
    return Math.max(0, valueInSeconds);
  }
  return Math.max(0, fallbackMs / 1000);
}

export async function suppressSurfaceForBackgroundCaptureCore(
  options: {
    waitMs?: number;
    settleMs: number;
    includeSettleTiming: boolean;
  } = {
    settleMs: 0,
    includeSettleTiming: false,
  },
): Promise<SurfaceCollapseResult> {
  const waitMs = normalizeWaitMs(options.waitMs);
  const settleMs = normalizeWaitMs(options.settleMs);

  const result = await IpcBridge.invoke<PrepareSurfaceResult>(
    INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT,
    {
      waitMs,
      settleMs,
      hideSurface: true,
    },
  );
  if (result?.success !== true) {
    throw new Error(result?.reason || 'prepare-surface-for-screenshot failed');
  }

  const hiddenSurface = result?.hiddenSurface ?? 'none';
  return {
    collapsed: hiddenSurface === 'chatbox' || hiddenSurface === 'main-window',
    hiddenSurface,
    timing: {
      waitTime: toSeconds(result?.waitTime, result?.waitMs ?? waitMs),
      hideInvokeTime: toSeconds(result?.hideInvokeTime, 0),
      settleTime: options.includeSettleTiming
        ? toSeconds(result?.settleTime, result?.settleMs ?? settleMs)
        : 0,
    },
  };
}

export async function restoreSurfaceAfterBackgroundCaptureCore(
  hiddenSurface: HiddenSurface = 'chatbox',
  options: { measureInvokeTime?: boolean } = {},
): Promise<SurfaceRestoreResult> {
  const measureInvokeTime = options.measureInvokeTime === true;
  const restoreStartTime = measureInvokeTime ? performance.now() : 0;

  await IpcBridge.invoke(
    INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT,
    { hiddenSurface },
  );

  return {
    restored: hiddenSurface !== 'none',
    restoredSurface: hiddenSurface,
    restoreInvokeTime: measureInvokeTime
      ? (performance.now() - restoreStartTime) / 1000
      : 0,
  };
}
