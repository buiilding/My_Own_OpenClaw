const DISPLAY_BOUNDS_STORAGE_KEY = 'desktop-assistant-display-bounds';

type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDisplayBounds(raw: string): DisplayBounds | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const { x, y, width, height } = parsed as DisplayBounds;
    if (
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(width) ||
      !isFiniteNumber(height)
    ) {
      return null;
    }
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { x, y, width, height };
  } catch (error) {
    console.warn('[DisplaySelection] Failed to parse stored bounds:', error);
    return null;
  }
}

function readLocalStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch (error) {
    console.warn('[DisplaySelection] Failed to read localStorage:', error);
    return '';
  }
}

export function getStoredDisplayBounds(): DisplayBounds | null {
  const raw = readLocalStorage(DISPLAY_BOUNDS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return parseDisplayBounds(raw);
}
