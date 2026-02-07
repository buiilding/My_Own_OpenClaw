import {
  DEFAULT_FRONTEND_CONFIG,
  clearConfigStorage,
  getConfigVersion,
  hasStoredConfig,
  loadConfigFromStorage,
  saveConfigToStorage,
} from '../../frontend/src/renderer/utils/configStorage.js';

const CONFIG_KEY = 'desktop-assistant-config';
const VERSION_KEY = 'desktop-assistant-config-version';

describe('configStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loadConfigFromStorage returns defaults when empty', () => {
    expect(loadConfigFromStorage()).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(hasStoredConfig()).toBe(false);
  });

  test('loadConfigFromStorage returns a new config object each call', () => {
    const first = loadConfigFromStorage();
    const second = loadConfigFromStorage();
    expect(first).not.toBe(second);
  });

  test('loadConfigFromStorage merges stored overrides with defaults', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ model_mode: 'offline' }));
    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
      model_mode: 'offline',
    });
  });

  test('loadConfigFromStorage clears invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, '{bad json');
    const result = loadConfigFromStorage();
    expect(result).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });

  test('saveConfigToStorage rejects invalid payloads', () => {
    expect(saveConfigToStorage(null)).toBe(false);
    expect(saveConfigToStorage(['nope'])).toBe(false);
  });

  test('saveConfigToStorage persists config and version', () => {
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, 123);
    expect(ok).toBe(true);
    expect(hasStoredConfig()).toBe(true);
    expect(getConfigVersion()).toBe(123);
  });

  test('saveConfigToStorage uses Date.now when version omitted', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(456);
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG);
    expect(ok).toBe(true);
    expect(getConfigVersion()).toBe(456);
    nowSpy.mockRestore();
  });

  test('getConfigVersion returns null for invalid value', () => {
    localStorage.setItem(VERSION_KEY, 'not-a-number');
    expect(getConfigVersion()).toBeNull();
  });

  test('hasStoredConfig handles storage errors', () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = jest.fn(() => {
      throw new Error('boom');
    });
    expect(hasStoredConfig()).toBe(false);
    localStorage.getItem = originalGetItem;
  });

  test('clearConfigStorage removes stored values', () => {
    saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, 123);
    clearConfigStorage();
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });
});
