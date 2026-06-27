/** @jest-environment node */

const {
  getChatWindowBounds,
  getResponseWindowBounds,
} = require('../../src/main/surfaces/overlay_bounds.cjs');

describe('overlay_bounds', () => {
  const screen = {
    getPrimaryDisplay: jest.fn().mockReturnValue({
      workArea: { x: 100, y: 50, width: 1400, height: 900 },
    }),
  };

  test('centers chat window at bottom of work area', () => {
    expect(getChatWindowBounds({ screen, width: 520, height: 96 })).toEqual({
      x: 540,
      y: 830,
      width: 520,
      height: 96,
    });
  });

  test('centers chat window on active display affinity work area instead of the primary display', () => {
    expect(getChatWindowBounds({
      screen,
      width: 520,
      height: 96,
      displayAffinity: {
        workArea: { x: 1920, y: 40, width: 2560, height: 1400 },
      },
    })).toEqual({
      x: 2940,
      y: 1320,
      width: 520,
      height: 96,
    });
  });

  test('clamps manual chat x within the active display work area while keeping bottom anchoring', () => {
    expect(getChatWindowBounds({
      screen,
      width: 520,
      height: 96,
      displayAffinity: {
        workArea: { x: 1920, y: 40, width: 2560, height: 1400 },
      },
      targetX: 4700,
    })).toEqual({
      x: 3960,
      y: 1320,
      width: 520,
      height: 96,
    });
  });

  test('response bounds fall back to chat window placement when chat bounds missing', () => {
    expect(getResponseWindowBounds({ screen, width: 520, height: 120 })).toEqual({
      x: 540,
      y: 806,
      width: 520,
      height: 120,
    });
  });

  test('response fallback bounds use active display affinity when chat bounds are missing', () => {
    expect(getResponseWindowBounds({
      screen,
      width: 520,
      height: 120,
      displayAffinity: {
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    })).toEqual({
      x: 2940,
      y: 1296,
      width: 520,
      height: 120,
    });
  });

  test('ignores non-finite display affinity work areas and uses fallback bounds', () => {
    expect(getChatWindowBounds({
      screen,
      width: 520,
      height: 96,
      displayAffinity: {
        workArea: { x: Infinity, y: 40, width: 2560, height: 1400 },
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    })).toEqual({
      x: 2940,
      y: 1320,
      width: 520,
      height: 96,
    });
  });

  test('ignores malformed primary display work area and uses primary bounds', () => {
    const malformedPrimaryScreen = {
      getPrimaryDisplay: jest.fn().mockReturnValue({
        workArea: { x: Infinity, y: 50, width: 1400, height: 900 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
    };

    expect(getChatWindowBounds({
      screen: malformedPrimaryScreen,
      width: 520,
      height: 96,
    })).toEqual({
      x: 700,
      y: 960,
      width: 520,
      height: 96,
    });
  });

  test('normalizes malformed fallback overlay dimensions before placement', () => {
    expect(getChatWindowBounds({
      screen,
      width: Infinity,
      height: Number.NaN,
    })).toEqual({
      x: 800,
      y: 925,
      width: 1,
      height: 1,
    });
  });

  test('response bounds align above current chat bounds when available', () => {
    expect(
      getResponseWindowBounds({
        screen,
        width: 400,
        height: 200,
        chatBounds: { x: 200, y: 700, width: 600, height: 96 },
      }),
    ).toEqual({
      x: 300,
      y: 490,
      width: 400,
      height: 200,
    });
  });

  test('compact response bounds apply hover offset so typing bubble sits near chat pill', () => {
    expect(
      getResponseWindowBounds({
        screen,
        width: 320,
        height: 30,
        chatBounds: { x: 200, y: 700, width: 600, height: 96 },
        gap: 2,
      }),
    ).toEqual({
      x: 340,
      y: 674,
      width: 320,
      height: 30,
    });
  });

  test('compactHover flag keeps hover offset for taller awaiting overlays', () => {
    expect(
      getResponseWindowBounds({
        screen,
        width: 320,
        height: 120,
        chatBounds: { x: 200, y: 700, width: 600, height: 96 },
        gap: 2,
        compactHover: true,
      }),
    ).toEqual({
      x: 340,
      y: 584,
      width: 320,
      height: 120,
    });
  });

});
