/**
 * Covers wakeword event utils. behavior in the frontend test suite.
 */

import { DesktopWakewordEventRuntime } from '../../src/renderer/app/runtime/desktopWakewordEventRuntime';

const {
  getChunkSizeWarning,
  isWithinCooldown,
  resolveConfidence,
} = DesktopWakewordEventRuntime;

describe('wakewordEventUtils', () => {
  test('getChunkSizeWarning returns warning only when chunk size is normalized', () => {
    expect(getChunkSizeWarning(1024, 1024)).toBeNull();
    expect(getChunkSizeWarning(1000, 1024)).toBe(
      '[Wakeword] chunkSize 1000 is not a power of 2, using 1024 instead',
    );
  });

  test('resolveConfidence accepts finite numbers only', () => {
    expect(resolveConfidence(0.75)).toBe(0.75);
    expect(resolveConfidence(Number.NaN)).toBeNull();
    expect(resolveConfidence(Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveConfidence('0.8')).toBeNull();
  });

  test('isWithinCooldown checks detection cooldown boundary', () => {
    expect(isWithinCooldown(2000, 1000, 1500)).toBe(true);
    expect(isWithinCooldown(2600, 1000, 1500)).toBe(false);
  });
});
