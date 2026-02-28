export function normalizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCorrelationId(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeCorrelationId(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}
