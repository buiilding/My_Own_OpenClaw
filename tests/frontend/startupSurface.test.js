import { selectStartupSurface } from '../../frontend/src/renderer/app/startupSurface';

describe('startupSurface', () => {
  test('routes vm mode directly to dashboard', () => {
    expect(selectStartupSurface({
      vmModeEnabled: true,
      bootstrapped: false,
      needsOnboarding: true,
      onboardingCompleted: false,
    })).toBe('dashboard-vm');
  });

  test('uses persisted onboarding completion before bootstrap', () => {
    expect(selectStartupSurface({
      vmModeEnabled: false,
      bootstrapped: false,
      needsOnboarding: true,
      onboardingCompleted: true,
    })).toBe('dashboard');
  });

  test('uses manifest-aware onboarding gate after bootstrap', () => {
    expect(selectStartupSurface({
      vmModeEnabled: false,
      bootstrapped: true,
      needsOnboarding: true,
      onboardingCompleted: true,
    })).toBe('onboarding');
  });
});
