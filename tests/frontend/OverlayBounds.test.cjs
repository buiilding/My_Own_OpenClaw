/** @jest-environment node */

const {
  getChatWindowBounds,
  getResponseWindowBounds,
  getContextLabelWindowBounds,
} = require('../../frontend/src/main/overlay_bounds.cjs');

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

  test('response bounds fall back to chat window placement when chat bounds missing', () => {
    expect(getResponseWindowBounds({ screen, width: 520, height: 120 })).toEqual({
      x: 540,
      y: 806,
      width: 520,
      height: 120,
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

  test('context label bounds use fallback chat position when chat bounds missing', () => {
    expect(
      getContextLabelWindowBounds({
        screen,
        labelWidth: 280,
        labelHeight: 26,
        offsetX: 14,
        gapAbove: -6,
      }),
    ).toEqual({
      x: 660,
      y: 880,
      width: 280,
      height: 26,
    });
  });

  test('context label bounds anchor to chat bounds when chat exists', () => {
    expect(
      getContextLabelWindowBounds({
        screen,
        chatBounds: { x: 250, y: 700, width: 520, height: 96 },
        labelWidth: 280,
        labelHeight: 26,
        offsetX: 14,
        gapAbove: -6,
      }),
    ).toEqual({
      x: 264,
      y: 680,
      width: 280,
      height: 26,
    });
  });
});
