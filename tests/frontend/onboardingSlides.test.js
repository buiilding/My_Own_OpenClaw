import { buildOnboardingSlideState } from '../../frontend/src/renderer/features/onboarding/utils/onboardingSlides';

describe('buildOnboardingSlideState', () => {
  test('builds permission slide state for in-range indices', () => {
    const slideState = buildOnboardingSlideState({
      permissions: [
        { permission_id: 'screen_capture', label: 'Screen capture' },
        { permission_id: 'microphone', label: 'Microphone' },
      ],
      activeSlideIndex: 1,
    });

    expect(slideState.totalSlides).toBe(3);
    expect(slideState.isPermissionSlide).toBe(true);
    expect(slideState.isStopFlowSlide).toBe(false);
    expect(slideState.isLastSlide).toBe(false);
    expect(slideState.activePermission).toEqual({ permission_id: 'microphone', label: 'Microphone' });
    expect(slideState.activeSlideTitle).toBe('Set up system access');
  });

  test('clamps overflow indices onto the stop slide', () => {
    const slideState = buildOnboardingSlideState({
      permissions: [{ permission_id: 'screen_capture', label: 'Screen capture' }],
      activeSlideIndex: 8,
    });

    expect(slideState.activeSlideIndex).toBe(1);
    expect(slideState.isPermissionSlide).toBe(false);
    expect(slideState.isStopFlowSlide).toBe(true);
    expect(slideState.isLastSlide).toBe(true);
    expect(slideState.activePermission).toBeNull();
    expect(slideState.activeSlideTitle).toBe('Stop the agent during loops');
  });
});
