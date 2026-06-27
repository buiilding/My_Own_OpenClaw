/**
 * Covers config comparison. behavior in the frontend test suite.
 */

import { hasShallowConfigChanges } from '../../src/renderer/app/providers/configComparison';

describe('hasShallowConfigChanges', () => {
  test('returns false when shallow config values are identical', () => {
    const current = { a: 1, b: 'x', c: true };
    const next = { a: 1, b: 'x', c: true };

    expect(hasShallowConfigChanges(current, next)).toBe(false);
  });

  test('returns true when a value changes', () => {
    const current = { a: 1, b: 'x' };
    const next = { a: 2, b: 'x' };

    expect(hasShallowConfigChanges(current, next)).toBe(true);
  });

  test('returns true when a key is removed', () => {
    const current = { a: 1, b: 'x' };
    const next = { a: 1 };

    expect(hasShallowConfigChanges(current, next)).toBe(true);
  });

  test('returns true when a key is added', () => {
    const current = { a: 1 };
    const next = { a: 1, b: 'x' };

    expect(hasShallowConfigChanges(current, next)).toBe(true);
  });

  test('handles nullish configs', () => {
    expect(hasShallowConfigChanges(null, undefined)).toBe(false);
    expect(hasShallowConfigChanges(undefined, { a: 1 })).toBe(true);
    expect(hasShallowConfigChanges({ a: 1 }, null)).toBe(true);
  });

  test('returns false for equivalent nested provider config values', () => {
    const current = {
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-current' },
      },
    };
    const next = {
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-current' },
      },
    };

    expect(hasShallowConfigChanges(current, next)).toBe(false);
  });

  test('returns true when nested provider config content changes', () => {
    const current = {
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-current' },
      },
    };
    const next = {
      provider_api_keys: {
        openai: { enabled: false, api_key: 'sk-current' },
      },
    };

    expect(hasShallowConfigChanges(current, next)).toBe(true);
  });
});
