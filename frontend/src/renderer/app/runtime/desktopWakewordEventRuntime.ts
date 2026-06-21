/**
 * Provides wakeword event normalization helpers for the renderer app-runtime.
 */

function getChunkSizeWarning(rawChunkSize: number, normalizedChunkSize: number): string | null {
  if (rawChunkSize === normalizedChunkSize) {
    return null;
  }
  return `[Wakeword] chunkSize ${rawChunkSize} is not a power of 2, using ${normalizedChunkSize} instead`;
}

function resolveConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function isWithinCooldown(now: number, lastDetection: number, cooldownMs: number): boolean {
  return now - lastDetection < cooldownMs;
}

export const DesktopWakewordEventRuntime = Object.freeze({
  getChunkSizeWarning,
  resolveConfidence,
  isWithinCooldown,
});
