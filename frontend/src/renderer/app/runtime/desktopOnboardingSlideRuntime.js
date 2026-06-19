/**
 * Owns renderer onboarding slide-state rules for the app startup runtime.
 */

export function buildOnboardingSlideState({ permissions, activeSlideIndex }) {
  const permissionSlides = Array.isArray(permissions) ? permissions : [];
  const permissionSlideCount = permissionSlides.length > 0 ? permissionSlides.length : 1;
  const totalSlides = permissionSlideCount + 1;
  const clampedSlideIndex = Math.min(Math.max(activeSlideIndex, 0), totalSlides - 1);
  const isStopFlowSlide = clampedSlideIndex >= permissionSlideCount;
  const isPermissionSlide = !isStopFlowSlide;
  const isLastSlide = clampedSlideIndex === totalSlides - 1;
  const activePermission = isPermissionSlide && permissionSlides.length > 0
    ? permissionSlides[Math.min(clampedSlideIndex, permissionSlides.length - 1)]
    : null;

  return {
    permissionSlides,
    permissionSlideCount,
    totalSlides,
    activeSlideIndex: clampedSlideIndex,
    isPermissionSlide,
    isStopFlowSlide,
    isLastSlide,
    activePermission,
    activeSlideTitle: isPermissionSlide
      ? 'Set up system access'
      : 'Stop the agent during loops',
    activeSlideBody: isPermissionSlide
      ? 'Review each item before you continue. Some are OS permissions, some are app capabilities, and some are workspace or runtime checks.'
      : 'Use this anytime an agent loop needs to end right away.',
  };
}
