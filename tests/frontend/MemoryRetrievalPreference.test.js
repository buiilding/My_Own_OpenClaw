/**
 * Covers memory retrieval preference. behavior in the frontend test suite.
 */

import {
  getMemoryRetrievalInjectionEnabled,
  setMemoryRetrievalInjectionEnabled,
} from '../../frontend/src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime';
import { RENDERER_STORAGE_KEYS } from '../../frontend/src/renderer/app/skin/desktopRuntimeConfig';

const MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY = RENDERER_STORAGE_KEYS.memoryRetrievalInjection;

describe('memoryRetrievalPreference', () => {
  beforeEach(() => {
    window.localStorage.removeItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  });

  test('defaults to enabled when no stored preference exists', () => {
    expect(getMemoryRetrievalInjectionEnabled()).toBe(true);
  });

  test('ignores removed desktop assistant storage key', () => {
    window.localStorage.setItem(
      'desktop-assistant-memory-retrieval-injection-enabled',
      'false',
    );

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

  test('defaults to enabled when storage read fails', () => {
    const throwingStorage = {
      getItem: jest.fn(() => {
        throw new Error('storage blocked');
      }),
    };

    expect(getMemoryRetrievalInjectionEnabled(throwingStorage)).toBe(true);
  });

  test('returns normalized preference when storage write fails', () => {
    const throwingStorage = {
      setItem: jest.fn(() => {
        throw new Error('quota exceeded');
      }),
    };

    expect(() => setMemoryRetrievalInjectionEnabled(false, throwingStorage)).not.toThrow();
    expect(setMemoryRetrievalInjectionEnabled(false, throwingStorage)).toBe(false);
    expect(setMemoryRetrievalInjectionEnabled('yes', throwingStorage)).toBe(true);
  });
});
