/**
 * Defines config comparison configuration for the renderer UI.
 */

const CONTENT_AWARE_CONFIG_KEYS = new Set([
  'provider_api_keys',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function areConfigValuesEqual(currentValue: unknown, nextValue: unknown): boolean {
  if (currentValue === nextValue) {
    return true;
  }
  if (Array.isArray(currentValue) || Array.isArray(nextValue)) {
    if (!Array.isArray(currentValue) || !Array.isArray(nextValue)) {
      return false;
    }
    if (currentValue.length !== nextValue.length) {
      return false;
    }
    return currentValue.every((value, index) => areConfigValuesEqual(value, nextValue[index]));
  }
  if (isPlainObject(currentValue) || isPlainObject(nextValue)) {
    if (!isPlainObject(currentValue) || !isPlainObject(nextValue)) {
      return false;
    }
    const currentKeys = Object.keys(currentValue);
    const nextKeys = Object.keys(nextValue);
    if (currentKeys.length !== nextKeys.length) {
      return false;
    }
    return currentKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(nextValue, key)
      && areConfigValuesEqual(currentValue[key], nextValue[key])
    ));
  }
  return false;
}

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
    if (CONTENT_AWARE_CONFIG_KEYS.has(key)) {
      if (!areConfigValuesEqual(current[key], next[key])) {
        return true;
      }
      continue;
    }
    if (next[key] !== current[key]) {
      return true;
    }
  }

  return false;
}
