import { getRoundedFrameSize } from '../../frontend/src/renderer/features/chat/utils/overlayFrameSize';

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
});
