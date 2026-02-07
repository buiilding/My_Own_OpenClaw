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

  test('loadConfigFromStorage forces voice_mode_enabled to false', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ voice_mode_enabled: true, speech_mode_enabled: true }),
    );

    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
      speech_mode_enabled: true,
      voice_mode_enabled: false,
    });
  });

  test('loadConfigFromStorage clears invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, '{bad json');
    const result = loadConfigFromStorage();
    expect(result).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });

  test('loadConfigFromStorage clears non-object payloads', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(['array-not-allowed']));

    const result = loadConfigFromStorage();

    expect(result).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
    warnSpy.mockRestore();
  });

  test('saveConfigToStorage rejects invalid payloads', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(saveConfigToStorage(null)).toBe(false);
    expect(saveConfigToStorage(['nope'])).toBe(false);
    warnSpy.mockRestore();
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

  test('saveConfigToStorage uses Date.now when version is null', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(789);
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, null);
    expect(ok).toBe(true);
    expect(getConfigVersion()).toBe(789);
    nowSpy.mockRestore();
  });

  test('getConfigVersion returns null for invalid value', () => {
    localStorage.setItem(VERSION_KEY, 'not-a-number');
    expect(getConfigVersion()).toBeNull();
  });

  test('getConfigVersion returns null when key is missing', () => {
    expect(getConfigVersion()).toBeNull();
  });

  test('hasStoredConfig handles storage errors', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(hasStoredConfig()).toBe(false);
    getItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('clearConfigStorage removes stored values', () => {
    saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, 123);
    clearConfigStorage();
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });

  test('saveConfigToStorage returns false when storage write throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('set-failed');
    });

    expect(saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, 111)).toBe(false);
    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('getConfigVersion returns null when storage read throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read-failed');
    });

    expect(getConfigVersion()).toBeNull();
    getItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('clearConfigStorage swallows remove errors', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('remove-failed');
    });

    expect(() => clearConfigStorage()).not.toThrow();
    removeItemSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
