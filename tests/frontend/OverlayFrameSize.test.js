import { getRoundedFrameSize } from '../../frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize';

describe('overlayFrameSize', () => {
  test('returns rounded frame size with minimum 1x1 bounds', () => {
    const size = getRoundedFrameSize({
      getBoundingClientRect: () => ({ width: 0.4, height: 0.49 }),
    });
    expect(size).toEqual({ width: 1, height: 1 });
  });

  test('returns null when no measurable element exists', () => {
    expect(getRoundedFrameSize(null)).toBeNull();
    expect(getRoundedFrameSize({})).toBeNull();
  });

  test('uses ceil and structural box metrics to avoid clipping from fractional frame bounds', () => {
    const size = getRoundedFrameSize({
      scrollWidth: 183,
      scrollHeight: 121,
      offsetWidth: 182,
      offsetHeight: 120,
      getBoundingClientRect: () => ({ width: 182.01, height: 120.01 }),
    });
    expect(size).toEqual({ width: 183, height: 121 });
  });
});
