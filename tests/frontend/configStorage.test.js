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

  test('clearConfigStorage removes stored values', () => {
    saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, 123);
    clearConfigStorage();
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });
});
