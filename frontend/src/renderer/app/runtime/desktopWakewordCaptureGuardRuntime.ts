/**
 * Provides wakeword capture guard helpers for the renderer app-runtime.
 */

import { DesktopVoiceAudioInputDeviceRuntime } from './desktopVoiceAudioInputDeviceRuntime';

type WakewordCaptureGuard = {
  missingDeviceLocked: boolean;
  nextRetryAt: number;
};

const globalWithWakewordGuard = globalThis as typeof globalThis & {
  __desktopRuntimeWakewordCaptureGuard?: WakewordCaptureGuard;
};

const defaultGuard: WakewordCaptureGuard = {
  missingDeviceLocked: false,
  nextRetryAt: 0,
};

function getWakewordCaptureGuard(): WakewordCaptureGuard {
  if (!globalWithWakewordGuard.__desktopRuntimeWakewordCaptureGuard) {
    globalWithWakewordGuard.__desktopRuntimeWakewordCaptureGuard = { ...defaultGuard };
  }
  return globalWithWakewordGuard.__desktopRuntimeWakewordCaptureGuard;
}

function clearWakewordCaptureGuard(guard: WakewordCaptureGuard): void {
  guard.missingDeviceLocked = false;
  guard.nextRetryAt = 0;
}

function isMissingAudioDeviceError(error: unknown): boolean {
  const name = typeof (error as { name?: unknown })?.name === 'string'
    ? (error as { name: string }).name
    : '';
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message.toLowerCase()
    : '';
  return name === 'NotFoundError' || message.includes('requested device not found');
}

async function hasAvailableAudioInputDevice(): Promise<boolean> {
  return DesktopVoiceAudioInputDeviceRuntime.hasAvailableAudioInputDevice();
}

export const DesktopWakewordCaptureGuardRuntime = Object.freeze({
  clearWakewordCaptureGuard,
  getWakewordCaptureGuard,
  hasAvailableAudioInputDevice,
  isMissingAudioDeviceError,
});
