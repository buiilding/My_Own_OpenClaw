/**
 * Provides the memory retrieval preference module for the renderer UI.
 */

import { RENDERER_STORAGE_KEYS } from '../app/skin/desktopRuntimeConfig';

const MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY = RENDERER_STORAGE_KEYS.memoryRetrievalInjection;

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
  let storedValue;
  try {
    storedValue = targetStorage.getItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  } catch (_error) {
    return true;
  }
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
    try {
      targetStorage.setItem(
        MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY,
        normalizedEnabled ? 'true' : 'false',
      );
    } catch (_error) {
      return normalizedEnabled;
    }
  }
  return normalizedEnabled;
}
