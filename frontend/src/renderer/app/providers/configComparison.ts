export function hasShallowConfigChanges(
  currentConfig: Record<string, any> | null | undefined,
  nextConfig: Record<string, any> | null | undefined,
): boolean {
  const current = currentConfig || {};
  const next = nextConfig || {};

  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return true;
  }

  for (const key of nextKeys) {
    if (next[key] !== current[key]) {
      return true;
    }
  }

  return false;
}

