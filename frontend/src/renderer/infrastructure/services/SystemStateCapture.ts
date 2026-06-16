/**
 * Provides the system state capture module for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { prepareExternalFocusForCapture } from './SurfaceOrchestrator';
import { logSystemStateCaptureTiming } from './toolExecution/ToolExecutionLogger';

type SystemState = {
  active_window?: string;
  mouse_position?: string;
  screen_resolution?: string;
  time?: string;
  clipboard?: string;
  windows?: string[];
};

type CaptureSystemStateOptions = {
  waitSeconds?: number;
  includeWindows?: boolean;
  correlationId?: string | null;
};

export function waitForCaptureDelay(waitSeconds: number): Promise<void> {
  const waitMilliseconds = Math.max(0, waitSeconds) * 1000;
  if (waitMilliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
}

export async function captureSystemState({
  waitSeconds = 0,
  includeWindows = false,
  correlationId = null,
}: CaptureSystemStateOptions = {}): Promise<SystemState | null> {
  const totalStartTime = performance.now();
  let waitTime = 0;
  let focusPrepTime = 0;
  let systemStateInvokeTime = 0;
  try {
    const waitStartTime = performance.now();
    await waitForCaptureDelay(waitSeconds);
    waitTime = (performance.now() - waitStartTime) / 1000;

    const focusPrepStartTime = performance.now();
    await prepareExternalFocusForCapture({
      captureId: correlationId,
      source: 'system-capture',
    });
    focusPrepTime = (performance.now() - focusPrepStartTime) / 1000;

    const systemStateInvokeStartTime = performance.now();
    const systemState = await IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: includeWindows
        ? ['active_window', 'mouse_position', 'screen_resolution', 'windows']
        : ['active_window', 'mouse_position', 'screen_resolution'],
    });
    systemStateInvokeTime = (performance.now() - systemStateInvokeStartTime) / 1000;
    return systemState;
  } catch (error) {
    console.error('[captureSystemState] Failed to capture system state:', error);
    return null;
  } finally {
    logSystemStateCaptureTiming({
      correlationId,
      waitTime,
      focusPrepTime,
      systemStateInvokeTime,
      totalTime: (performance.now() - totalStartTime) / 1000,
      includeWindows,
    });
  }
}
