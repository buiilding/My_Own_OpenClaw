const MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY = 'desktop-assistant-memory-retrieval-injection-enabled';

function resolveStorage(storage) {
  if (storage) {
    return storage;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage || null;
}

function normalizePreferenceValue(value) {
  return value !== false;
}

export function getMemoryRetrievalInjectionEnabled(storage = null) {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return true;
  }
  const storedValue = targetStorage.getItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  if (storedValue === null) {
    return true;
  }
  if (storedValue === 'false') {
    return false;
  }
  if (storedValue === 'true') {
    return true;
  }
  return true;
}

export function setMemoryRetrievalInjectionEnabled(enabled, storage = null) {
  const normalizedEnabled = normalizePreferenceValue(enabled);
  const targetStorage = resolveStorage(storage);
  if (targetStorage) {
    targetStorage.setItem(
      MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY,
      normalizedEnabled ? 'true' : 'false',
    );
  }
  return normalizedEnabled;
}
