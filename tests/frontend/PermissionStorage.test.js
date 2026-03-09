import {
  loadPermissionOnboardingState,
  savePermissionOnboardingState,
} from '../../frontend/src/renderer/features/permissions/utils/permissionStorage';

describe('permission onboarding storage', () => {
  const STORAGE_KEY = 'windieos-permission-onboarding';

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

  test('fails closed for malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{bad json');

    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: '',
      completed: false,
      completed_at: null,
    });
  });

  test('drops legacy planned-system-access consent field when reloading stored state', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      manifest_version: 'v2',
      completed: true,
      planned_system_access_consent: true,
      completed_at: '2026-03-04T00:00:00.000Z',
    }));

    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: 'v2',
      completed: true,
      completed_at: '2026-03-04T00:00:00.000Z',
    });
  });
});
