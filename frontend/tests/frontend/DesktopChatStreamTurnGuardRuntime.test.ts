/**
 * Covers desktop chat stream turn guard runtime. behavior in the frontend test suite.
 */

import { DesktopChatStreamTurnGuardRuntime } from '../../src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime';

describe('DesktopChatStreamTurnGuardRuntime', () => {
  const {
    isStaleTurnForActiveStream,
  } = DesktopChatStreamTurnGuardRuntime;

  test('treats missing event turn refs as non-stale', () => {
    expect(isStaleTurnForActiveStream(undefined, 'turn-1')).toBe(false);
    expect(isStaleTurnForActiveStream(null, 'turn-1')).toBe(false);
  });

  test('treats missing active turn refs as non-stale', () => {
    expect(isStaleTurnForActiveStream('turn-1', undefined)).toBe(false);
    expect(isStaleTurnForActiveStream('turn-1', null)).toBe(false);
  });

  test('marks mismatched turn refs as stale', () => {
    expect(isStaleTurnForActiveStream('turn-new', 'turn-old')).toBe(true);
  });

  test('accepts matching turn refs', () => {
    expect(isStaleTurnForActiveStream('turn-1', 'turn-1')).toBe(false);
  });

  test('treats whitespace-only turn refs as missing', () => {
    expect(isStaleTurnForActiveStream('   ', 'turn-1')).toBe(false);
    expect(isStaleTurnForActiveStream('turn-1', '   ')).toBe(false);
  });

  test('normalizes trimmed turn refs before stale comparison', () => {
    expect(isStaleTurnForActiveStream(' turn-1 ', 'turn-1')).toBe(false);
    expect(isStaleTurnForActiveStream('turn-1', ' turn-1 ')).toBe(false);
  });
});
