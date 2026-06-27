/**
 * Covers permission storage. behavior in the frontend test suite.
 */

import {
  DesktopPermissionOnboardingStorageRuntime,
} from '../../src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime';

const {
  getPermissionOnboardingStorageKey,
  loadPermissionOnboardingState,
  savePermissionOnboardingState,
} = DesktopPermissionOnboardingStorageRuntime;

describe('permission onboarding storage', () => {
  const STORAGE_KEY = getPermissionOnboardingStorageKey();

  beforeEach(() => {
    window.localStorage.clear();
  });

  test('returns default state when storage is empty', () => {
    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: '',
      completed: false,
      completed_at: null,
    });
  });

  test('saves and reloads a completed state', () => {
    const saved = {
      manifest_version: 'v1',
      completed: true,
      completed_at: '2026-03-03T00:00:00.000Z',
    };
    savePermissionOnboardingState(saved);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(saved));
    expect(loadPermissionOnboardingState()).toEqual(saved);
  });

  test('exposes the active onboarding storage key through the runtime owner', () => {
    expect(getPermissionOnboardingStorageKey()).toBe(STORAGE_KEY);
  });

  test('ignores removed permission storage key', () => {
    const saved = {
      manifest_version: 'v1',
      completed: true,
      completed_at: '2026-03-03T00:00:00.000Z',
    };
    const removedStorageKey = `desktop-${'agent'}-permission-onboarding`;
    window.localStorage.setItem(removedStorageKey, JSON.stringify(saved));

    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: '',
      completed: false,
      completed_at: null,
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(removedStorageKey)).toBe(JSON.stringify(saved));
  });

  test('fails closed for malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{bad json');

    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: '',
      completed: false,
      completed_at: null,
    });
  });

  test('drops unknown fields when reloading stored state', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      manifest_version: 'v2',
      completed: true,
      unknown_field: true,
      completed_at: '2026-03-04T00:00:00.000Z',
    }));

    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: 'v2',
      completed: true,
      completed_at: '2026-03-04T00:00:00.000Z',
    });
  });
});
