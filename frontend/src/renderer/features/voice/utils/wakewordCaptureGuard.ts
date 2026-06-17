/**
 * Provides the wakeword capture guard module for the renderer UI.
 */

type WakewordCaptureGuard = {
  missingDeviceLocked: boolean;
  nextRetryAt: number;
};

const globalWithWakewordGuard = globalThis as typeof globalThis & {
  __desktopAgentWakewordCaptureGuard?: WakewordCaptureGuard;
};

const defaultGuard: WakewordCaptureGuard = {
  missingDeviceLocked: false,
  nextRetryAt: 0,
};

export function getWakewordCaptureGuard(): WakewordCaptureGuard {
  if (!globalWithWakewordGuard.__desktopAgentWakewordCaptureGuard) {
    globalWithWakewordGuard.__desktopAgentWakewordCaptureGuard = { ...defaultGuard };
  }
  return globalWithWakewordGuard.__desktopAgentWakewordCaptureGuard;
}

export function clearWakewordCaptureGuard(guard: WakewordCaptureGuard): void {
  guard.missingDeviceLocked = false;
  guard.nextRetryAt = 0;
}

export function isMissingAudioDeviceError(error: unknown): boolean {
  const name = typeof (error as { name?: unknown })?.name === 'string'
    ? (error as { name: string }).name
    : '';
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message.toLowerCase()
    : '';
  return name === 'NotFoundError' || message.includes('requested device not found');
}

export async function hasAvailableAudioInputDevice(): Promise<boolean> {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    return false;
  }

  try {
    const devices = await mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'audioinput');
  } catch {
    return false;
  }
}
