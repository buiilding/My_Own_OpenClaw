/**
 * Covers renderer startup surface selection in the frontend test suite.
 */

import {
  DesktopStartupRuntimeClient,
} from '../../src/renderer/app/runtime/desktopStartupRuntimeClient';

describe('startupSurface', () => {
  test('routes vm mode directly to dashboard', () => {
    expect(DesktopStartupRuntimeClient.selectStartupSurface({
      vmModeEnabled: true,
      bootstrapped: false,
      needsOnboarding: true,
      onboardingCompleted: false,
    })).toBe('dashboard-vm');
  });

  test('uses persisted onboarding completion before bootstrap', () => {
    expect(DesktopStartupRuntimeClient.selectStartupSurface({
      vmModeEnabled: false,
      bootstrapped: false,
      needsOnboarding: true,
      onboardingCompleted: true,
    })).toBe('dashboard');
  });

  test('uses manifest-aware onboarding gate after bootstrap', () => {
    expect(DesktopStartupRuntimeClient.selectStartupSurface({
      vmModeEnabled: false,
      bootstrapped: true,
      needsOnboarding: true,
      onboardingCompleted: true,
    })).toBe('onboarding');
  });
});
