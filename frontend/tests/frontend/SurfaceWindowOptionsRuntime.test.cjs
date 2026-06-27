/** @jest-environment node */

const {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
} = require('../../src/main/surfaces/surface_window_options_runtime.cjs');

describe('surface_window_options_runtime', () => {
  test('normalizes chat surface options with explicit restore-overlay contract', () => {
    expect(normalizeChatSurfaceWindowOptions({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
      reason: ' Wakeword ',
      ignoredField: 'value',
    })).toEqual({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
      reason: 'wakeword',
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
      open: ' Settings ',
      targetDisplayAffinity: {
        monitor_id: '1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      reason: ' Chat-Pill-Settings ',
      ignoredField: 'value',
    })).toEqual({
      focus: false,
      maximize: true,
      open: 'settings',
      targetDisplayAffinity: {
        monitor_id: '1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      reason: 'chat-pill-settings',
    });
  });

  test('defaults main surface options to focused non-maximized', () => {
    expect(normalizeMainSurfaceWindowOptions()).toEqual({
      focus: true,
      maximize: false,
      open: '',
      targetDisplayAffinity: null,
    });
  });
});
