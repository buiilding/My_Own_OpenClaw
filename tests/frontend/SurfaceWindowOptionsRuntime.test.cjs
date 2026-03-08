/** @jest-environment node */

const {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
} = require('../../frontend/src/main/surface_window_options_runtime.cjs');

describe('surface_window_options_runtime', () => {
  test('normalizes chat surface options with explicit restore-overlay contract', () => {
    expect(normalizeChatSurfaceWindowOptions({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
      ignoredField: 'value',
    })).toEqual({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    });
  });

  test('defaults chat surface options to focused without response-overlay restore', () => {
    expect(normalizeChatSurfaceWindowOptions()).toEqual({
      focus: true,
      restoreResponseOverlay: false,
      targetDisplayAffinity: null,
    });
  });

  test('normalizes main surface options with explicit maximize/display contract', () => {
    expect(normalizeMainSurfaceWindowOptions({
      focus: false,
      maximize: true,
      targetDisplayAffinity: {
        monitor_id: '1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      ignoredField: 'value',
    })).toEqual({
      focus: false,
      maximize: true,
      targetDisplayAffinity: {
        monitor_id: '1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    });
  });

  test('defaults main surface options to focused non-maximized', () => {
    expect(normalizeMainSurfaceWindowOptions()).toEqual({
      focus: true,
      maximize: false,
      targetDisplayAffinity: null,
    });
  });
});
