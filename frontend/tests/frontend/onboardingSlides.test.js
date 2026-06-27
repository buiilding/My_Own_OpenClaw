/**
 * Covers onboarding slides. behavior in the frontend test suite.
 */

import { DesktopOnboardingSlideRuntime } from '../../src/renderer/app/runtime/desktopOnboardingSlideRuntime';

const {
  buildOnboardingSlideState,
} = DesktopOnboardingSlideRuntime;

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

  test('uses a placeholder permission slide when permission manifest is empty', () => {
    const slideState = buildOnboardingSlideState({
      permissions: [],
      activeSlideIndex: 0,
    });

    expect(slideState.permissionSlides).toEqual([]);
    expect(slideState.permissionSlideCount).toBe(1);
    expect(slideState.totalSlides).toBe(2);
    expect(slideState.isPermissionSlide).toBe(true);
    expect(slideState.activePermission).toBeNull();
  });

  test('clamps negative indices to the first slide', () => {
    const slideState = buildOnboardingSlideState({
      permissions: [{ permission_id: 'microphone', label: 'Microphone' }],
      activeSlideIndex: -4,
    });

    expect(slideState.activeSlideIndex).toBe(0);
    expect(slideState.isPermissionSlide).toBe(true);
    expect(slideState.activePermission).toEqual({ permission_id: 'microphone', label: 'Microphone' });
  });
});
