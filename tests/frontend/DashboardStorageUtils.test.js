import {
  loadLocalValue,
  saveLocalValue,
} from '../../frontend/src/renderer/features/dashboard/utils/storage';

describe('dashboard storage utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loadLocalValue returns stored value', () => {
    localStorage.setItem('dashboard:key', 'value-1');
    expect(loadLocalValue('dashboard:key', 'fallback')).toBe('value-1');
  });

  test('loadLocalValue returns fallback when key missing', () => {
    expect(loadLocalValue('missing:key', 'fallback')).toBe('fallback');
  });

  test('loadLocalValue returns fallback when storage access throws', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage-read-failed');
    });

    expect(loadLocalValue('key', 'fallback')).toBe('fallback');
    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('saveLocalValue writes value when truthy', () => {
    saveLocalValue('dashboard:key', 'value-2');
    expect(localStorage.getItem('dashboard:key')).toBe('value-2');
  });

  test('saveLocalValue removes key when value is falsy', () => {
    localStorage.setItem('dashboard:key', 'existing');

    saveLocalValue('dashboard:key', '');
    expect(localStorage.getItem('dashboard:key')).toBeNull();

    localStorage.setItem('dashboard:key', 'existing');
    saveLocalValue('dashboard:key', null);
    expect(localStorage.getItem('dashboard:key')).toBeNull();
  });

  test('saveLocalValue swallows storage write errors', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage-write-failed');
    });

    expect(() => saveLocalValue('dashboard:key', 'value')).not.toThrow();
    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('saveLocalValue swallows remove errors for falsy values', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage-remove-failed');
    });

    expect(() => saveLocalValue('dashboard:key', '')).not.toThrow();
    removeItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
