/**
 * Covers response overlay layout mode. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayLayoutRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime';

describe('desktopResponseOverlayLayoutRuntime layout mode', () => {
  const {
    getHiddenResponseOverlayLayoutMode,
    getResponseOverlayAwaitingFrameHeight,
    getResponseOverlayFixedHeight,
    isCompactHoverLayoutMode,
    isVisibleResponseOverlayLayoutMode,
    resolveResponseOverlayNativeMode,
    resolveResponseOverlayLayoutMode,
  } = DesktopResponseOverlayLayoutRuntime;

  test('resolves response mode when response content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      responseVisible: true,
      awaitingVisible: true,
    })).toBe('response');
  });

  test('resolves hidden mode when no overlay content is visible', () => {
    expect(resolveResponseOverlayLayoutMode({
      responseVisible: false,
      awaitingVisible: false,
    })).toBe('hidden');
  });

  test('resolves awaiting-typing mode when awaiting', () => {
    expect(resolveResponseOverlayLayoutMode({
      responseVisible: false,
      awaitingVisible: true,
    })).toBe('awaiting-typing');
  });

  test('compact hover applies only to awaiting modes', () => {
    expect(isCompactHoverLayoutMode('hidden')).toBe(false);
    expect(isCompactHoverLayoutMode('response')).toBe(false);
    expect(isCompactHoverLayoutMode('awaiting-typing')).toBe(true);
  });

  test('exposes semantic helpers for hidden, visible, and awaiting modes', () => {
    expect(getHiddenResponseOverlayLayoutMode()).toBe('hidden');
    expect(isVisibleResponseOverlayLayoutMode('hidden')).toBe(false);
    expect(isVisibleResponseOverlayLayoutMode('response')).toBe(true);
    expect(isVisibleResponseOverlayLayoutMode('awaiting-typing')).toBe(true);
    expect(resolveResponseOverlayNativeMode('awaiting-typing')).toBe('awaiting');
    expect(resolveResponseOverlayNativeMode('response')).toBe('response');
  });

  test('exposes fixed frame heights through helpers', () => {
    expect(getResponseOverlayAwaitingFrameHeight()).toBe(24);
    expect(getResponseOverlayFixedHeight()).toBe(236);
  });
});
