import {
  getMemoryRetrievalInjectionEnabled,
  MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY,
  setMemoryRetrievalInjectionEnabled,
} from '../../frontend/src/renderer/utils/memoryRetrievalPreference';

describe('memoryRetrievalPreference', () => {
  beforeEach(() => {
    window.localStorage.removeItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  });

  test('defaults to enabled when no stored preference exists', () => {
    expect(getMemoryRetrievalInjectionEnabled()).toBe(true);
  });

  test('persists disabled preference', () => {
    setMemoryRetrievalInjectionEnabled(false);
    expect(getMemoryRetrievalInjectionEnabled()).toBe(false);
    expect(window.localStorage.getItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY)).toBe('false');
  });

  test('persists enabled preference', () => {
    setMemoryRetrievalInjectionEnabled(true);
    expect(getMemoryRetrievalInjectionEnabled()).toBe(true);
    expect(window.localStorage.getItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY)).toBe('true');
  });
});
