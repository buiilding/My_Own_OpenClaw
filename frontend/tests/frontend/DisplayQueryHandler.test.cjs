/** @jest-environment node */

const {
  handleGetDisplays,
} = require('../../src/main/surfaces/display_query_handler.cjs');

describe('display_query_handler', () => {
  test('maps display payloads with stable labels and primary marker', () => {
    const screen = {
      getAllDisplays: jest.fn().mockReturnValue([
        {
          id: 10,
          size: { width: 1920, height: 1080 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          scaleFactor: 1,
        },
        {
          id: 20,
          size: { width: 2560, height: 1440 },
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          scaleFactor: 1.25,
        },
      ]),
      getPrimaryDisplay: jest.fn().mockReturnValue({ id: 20 }),
    };

    const result = handleGetDisplays({ screen });

    expect(result).toEqual([
      {
        id: 10,
        label: 'Display 1 (1920x1080)',
        isPrimary: false,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1,
      },
      {
        id: 20,
        label: 'Display 2 (2560x1440)',
        isPrimary: true,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        scaleFactor: 1.25,
      },
    ]);
  });

  test('returns empty list when no displays are reported', () => {
    const screen = {
      getAllDisplays: jest.fn().mockReturnValue([]),
      getPrimaryDisplay: jest.fn().mockReturnValue({ id: 1 }),
    };

    const result = handleGetDisplays({ screen });

    expect(result).toEqual([]);
  });
});
