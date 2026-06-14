/**
 * Provides the startup surface module for the renderer UI.
 */

export function selectStartupSurface({
  vmModeEnabled,
  bootstrapped,
  needsOnboarding,
  onboardingCompleted,
}) {
  if (vmModeEnabled) {
    return 'dashboard-vm';
  }

  const shouldShowOnboarding = bootstrapped
    ? needsOnboarding
    : !onboardingCompleted;

  if (shouldShowOnboarding) {
    return 'onboarding';
  }

  return 'dashboard';
}
