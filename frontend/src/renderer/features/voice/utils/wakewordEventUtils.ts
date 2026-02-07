export function getChunkSizeWarning(rawChunkSize: number, normalizedChunkSize: number): string | null {
  if (rawChunkSize === normalizedChunkSize) {
    return null;
  }
  return `[Wakeword] chunkSize ${rawChunkSize} is not a power of 2, using ${normalizedChunkSize} instead`;
}

export function resolveConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function isWithinCooldown(now: number, lastDetection: number, cooldownMs: number): boolean {
  return now - lastDetection < cooldownMs;
}
