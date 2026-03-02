import {
  loadFrontendOnboardingState,
  saveFrontendOnboardingState,
} from '../../frontend/src/renderer/features/onboarding/utils/frontendOnboardingStorage';

describe('frontend onboarding storage', () => {
  const STORAGE_KEY = 'windieos-frontend-onboarding';

  beforeEach(() => {
    window.localStorage.clear();
  });

  test('returns default state when storage is empty', () => {
    expect(loadFrontendOnboardingState()).toEqual({
      completed: false,
      completed_at: null,
    });
  });

  test('saves and reloads a completed state', () => {
    const saved = {
      completed: true,
      completed_at: '2026-03-02T00:00:00.000Z',
    };
    saveFrontendOnboardingState(saved);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(saved));
    expect(loadFrontendOnboardingState()).toEqual(saved);
  });

  test('fails closed for malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{bad json');

    expect(loadFrontendOnboardingState()).toEqual({
      completed: false,
      completed_at: null,
    });
  });
});

