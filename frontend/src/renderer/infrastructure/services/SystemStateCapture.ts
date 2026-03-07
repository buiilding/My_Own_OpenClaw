import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import type { SystemState } from './MessageFormatter';
import { prepareExternalFocusForCapture } from './SurfaceOrchestrator';

type CaptureSystemStateOptions = {
  waitSeconds?: number;
  includeWindows?: boolean;
  correlationId?: string | null;
};

function waitForCaptureDelay(waitSeconds: number): Promise<void> {
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
  try {
    await waitForCaptureDelay(waitSeconds);
    await prepareExternalFocusForCapture({
      captureId: correlationId,
      source: 'system-capture',
    });
    return await IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
      fields: includeWindows
        ? ['active_window', 'mouse_position', 'screen_resolution', 'windows']
        : ['active_window', 'mouse_position', 'screen_resolution'],
    });
  } catch (error) {
    console.error('[captureSystemState] Failed to capture system state:', error);
    return null;
  }
}
