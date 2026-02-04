export const DISPLAY_STORAGE_KEY = 'desktop-assistant-display-id';
export const DISPLAY_BOUNDS_STORAGE_KEY = 'desktop-assistant-display-bounds';

export type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DisplayLike = {
  id?: string | number;
  bounds?: DisplayBounds | null;
};

function readLocalStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch (error) {
    console.warn('[DisplaySelection] Failed to read localStorage:', error);
    return '';
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[DisplaySelection] Failed to write localStorage:', error);
  }
}

export function getStoredDisplayId(): string {
  return readLocalStorage(DISPLAY_STORAGE_KEY);
}

export function getStoredDisplayBounds(): DisplayBounds | null {
  const raw = readLocalStorage(DISPLAY_BOUNDS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const { x, y, width, height } = parsed as DisplayBounds;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number'
    ) {
      return null;
    }
    return { x, y, width, height };
  } catch (error) {
    console.warn('[DisplaySelection] Failed to parse stored bounds:', error);
    return null;
  }
}

export function persistDisplaySelection(display: DisplayLike | null): void {
  if (!display || display.id === undefined || display.id === null) {
    writeLocalStorage(DISPLAY_STORAGE_KEY, '');
    writeLocalStorage(DISPLAY_BOUNDS_STORAGE_KEY, '');
    return;
  }
  writeLocalStorage(DISPLAY_STORAGE_KEY, String(display.id));
  if (display.bounds) {
    writeLocalStorage(DISPLAY_BOUNDS_STORAGE_KEY, JSON.stringify(display.bounds));
  } else {
    writeLocalStorage(DISPLAY_BOUNDS_STORAGE_KEY, '');
  }
}
