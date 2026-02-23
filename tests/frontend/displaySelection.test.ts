import {
  getStoredDisplayBounds,
  getStoredDisplayId,
  persistDisplaySelection,
} from '../../frontend/src/renderer/utils/displaySelection';

const DISPLAY_STORAGE_KEY = 'desktop-assistant-display-id';
const DISPLAY_BOUNDS_STORAGE_KEY = 'desktop-assistant-display-bounds';

describe('displaySelection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('stores and reads display id/bounds', () => {
    persistDisplaySelection({
      id: 2,
      bounds: { x: 10, y: 20, width: 300, height: 200 },
    });

    expect(getStoredDisplayId()).toBe('2');
    expect(getStoredDisplayBounds()).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  });

  test('clears stored selection when persist receives null', () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, '1');
    localStorage.setItem(DISPLAY_BOUNDS_STORAGE_KEY, '{"x":0,"y":0,"width":100,"height":100}');

    persistDisplaySelection(null);

    expect(getStoredDisplayId()).toBe('');
    expect(getStoredDisplayBounds()).toBeNull();
  });

  test('persists id and clears bounds when bounds are missing', () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }),
    );

    persistDisplaySelection({ id: 'display-a' });

    expect(getStoredDisplayId()).toBe('display-a');
    expect(getStoredDisplayBounds()).toBeNull();
  });

  test('rejects stored bounds with non-positive dimensions', () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 0, y: 0, width: 0, height: 100 }),
    );
    expect(getStoredDisplayBounds()).toBeNull();

    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 0, y: 0, width: 100, height: -1 }),
    );
    expect(getStoredDisplayBounds()).toBeNull();
  });

  test('rejects stored bounds with non-finite values', () => {
    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: Number.NaN, y: 0, width: 100, height: 100 }),
    );
    expect(getStoredDisplayBounds()).toBeNull();

    localStorage.setItem(
      DISPLAY_BOUNDS_STORAGE_KEY,
      JSON.stringify({ x: 1, y: 2, width: Number.POSITIVE_INFINITY, height: 100 }),
    );
    expect(getStoredDisplayBounds()).toBeNull();
  });

  test('returns null for malformed stored bounds JSON', () => {
    localStorage.setItem(DISPLAY_BOUNDS_STORAGE_KEY, '{bad json');
    expect(getStoredDisplayBounds()).toBeNull();
  });
});
