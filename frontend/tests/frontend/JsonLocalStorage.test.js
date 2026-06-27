/**
 * Covers json local storage. behavior in the frontend test suite.
 */

import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from '../../src/renderer/infrastructure/storage/jsonLocalStorage';

describe('jsonLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('round-trips valid JSON objects', () => {
    writeJsonObjectToLocalStorage('settings', { theme: 'dark', count: 2 });

    expect(readJsonObjectFromLocalStorage('settings')).toEqual({
      theme: 'dark',
      count: 2,
    });
  });

  test('returns null for missing, malformed, and primitive values', () => {
    expect(readJsonObjectFromLocalStorage('missing')).toBeNull();

    window.localStorage.setItem('malformed', '{');
    window.localStorage.setItem('number', '42');
    window.localStorage.setItem('string', '"value"');
    window.localStorage.setItem('false', 'false');
    window.localStorage.setItem('null', 'null');

    expect(readJsonObjectFromLocalStorage('malformed')).toBeNull();
    expect(readJsonObjectFromLocalStorage('number')).toBeNull();
    expect(readJsonObjectFromLocalStorage('string')).toBeNull();
    expect(readJsonObjectFromLocalStorage('false')).toBeNull();
    expect(readJsonObjectFromLocalStorage('null')).toBeNull();
  });

  test('returns null when storage read throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(readJsonObjectFromLocalStorage('settings')).toBeNull();
  });

  test('does not throw when storage write fails', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      writeJsonObjectToLocalStorage('settings', { theme: 'dark' });
    }).not.toThrow();
  });
});
