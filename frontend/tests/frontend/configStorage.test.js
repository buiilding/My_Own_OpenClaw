/**
 * Covers config storage. behavior in the frontend test suite.
 */

import {
  DesktopRendererConfigStorageRuntime,
} from '../../src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js';
import {
  DesktopAppearanceThemeRuntime,
} from '../../src/renderer/app/runtime/desktopAppearanceThemeRuntime.js';

const {
  normalizeAppearanceTheme,
} = DesktopAppearanceThemeRuntime;
const {
  getRendererConfigStorageKey,
  isRendererConfigStorageEvent,
  loadConfigFromStorage,
  saveConfigToStorage,
} = DesktopRendererConfigStorageRuntime;

const CONFIG_KEY = getRendererConfigStorageKey();
const DEFAULT_RENDERER_CONFIG = {
  model_mode: 'online',
  model_provider: 'openai',
  selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
  interaction_mode: 'agent',
  speech_mode_enabled: false,
  wakeword_enabled: true,
  wakeword_stt_enabled: false,
  show_tool_logs: false,
  agent_custom_instructions: '',
  agent_disabled_local_tools: [],
  agent_disabled_remote_tools: [],
  agent_enabled_mcp_servers: [],
  browser_automation_enabled: false,
  global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
  include_query_screenshot: true,
  provider_api_keys: {
    openai: { enabled: false, api_key: '', has_saved_key: false },
    anthropic: { enabled: false, api_key: '', has_saved_key: false },
    google: { enabled: false, api_key: '', has_saved_key: false },
    openrouter: { enabled: false, api_key: '', has_saved_key: false },
    mistral: { enabled: false, api_key: '', has_saved_key: false },
    kimi_coding: { enabled: false, api_key: '', has_saved_key: false },
  },
  appearance_mode: 'system',
  appearance_theme: normalizeAppearanceTheme(),
};

describe('configStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loadConfigFromStorage returns defaults when empty', () => {
    expect(loadConfigFromStorage()).toEqual(DEFAULT_RENDERER_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
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
      ...DEFAULT_RENDERER_CONFIG,
      model_mode: 'offline',
    });
  });

  test('loadConfigFromStorage ignores removed desktop assistant storage key', () => {
    localStorage.setItem(
      'desktop-assistant-config',
      JSON.stringify({ model_mode: 'offline' }),
    );

    expect(loadConfigFromStorage()).toEqual(DEFAULT_RENDERER_CONFIG);
  });

  test('loadConfigFromStorage normalizes unsupported stored global stop shortcuts', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ global_agent_stop_shortcut: 'CommandOrControl+Alt+/' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
  });

  test('loadConfigFromStorage preserves stored speech_mode_enabled value', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ speech_mode_enabled: true }),
    );

    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
      speech_mode_enabled: true,
    });
  });

  test('loadConfigFromStorage drops deprecated renderer-owned speech_provider values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ speech_provider: 'elevenlabs' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
    });
  });

  test('loadConfigFromStorage preserves stored wakeword_enabled value', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ wakeword_enabled: false }),
    );

    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
      wakeword_enabled: false,
    });
  });

  test('loadConfigFromStorage preserves stored show_tool_logs value', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ show_tool_logs: true }),
    );

    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
      show_tool_logs: true,
    });
  });

  test('loadConfigFromStorage preserves valid appearance mode and normalizes invalid values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ appearance_mode: 'dark' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_RENDERER_CONFIG,
      appearance_mode: 'dark',
    });

    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ appearance_mode: 'sepia' }),
    );

    expect(loadConfigFromStorage()).toEqual(DEFAULT_RENDERER_CONFIG);
  });

  test('loadConfigFromStorage normalizes stored appearance theme values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        appearance_theme: {
          dark: {
            accent: '#007AFF',
            background: 'not-a-color',
            foreground: '#F9FAFB',
            translucent_sidebar: false,
            contrast: 120,
          },
        },
      }),
    );

    const result = loadConfigFromStorage();
    expect(result.appearance_theme.dark).toEqual({
      ...DEFAULT_RENDERER_CONFIG.appearance_theme.dark,
      accent: '#007AFF',
      foreground: '#F9FAFB',
      translucent_sidebar: false,
      contrast: 100,
    });
  });

  test('loadConfigFromStorage normalizes provider_api_keys with defaults', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        provider_api_keys: {
          openai: { enabled: true, api_key: 'sk-openai' },
        },
      }),
    );

    const result = loadConfigFromStorage();
    expect(result.provider_api_keys).toEqual({
      ...DEFAULT_RENDERER_CONFIG.provider_api_keys,
      openai: { enabled: true, api_key: '', has_saved_key: true },
    });
  });

  test('loadConfigFromStorage drops unknown persisted values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        backend_only_state: {
          token: 'runtime-token',
        },
      }),
    );

    const result = loadConfigFromStorage();
    expect(result.backend_only_state).toBeUndefined();
    expect(result).toEqual(DEFAULT_RENDERER_CONFIG);
  });

  test('saveConfigToStorage strips provider secrets and drops unknown fields from localStorage', () => {
    const ok = saveConfigToStorage({
      ...DEFAULT_RENDERER_CONFIG,
      provider_api_keys: {
        ...DEFAULT_RENDERER_CONFIG.provider_api_keys,
        openai: { enabled: true, api_key: 'sk-openai' },
      },
      backend_only_state: {
        token: 'runtime-token',
      },
    });

    expect(ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY));
    expect(stored.provider_api_keys.openai).toEqual({
      enabled: true,
      api_key: '',
      has_saved_key: true,
    });
    expect(stored.backend_only_state).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('sk-openai');
    expect(JSON.stringify(stored)).not.toContain('runtime-token');
  });

  test('loadConfigFromStorage clears invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, '{bad json');
    const result = loadConfigFromStorage();
    expect(result).toEqual(DEFAULT_RENDERER_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
  });

  test('loadConfigFromStorage clears non-object payloads', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(['array-not-allowed']));

    const result = loadConfigFromStorage();

    expect(result).toEqual(DEFAULT_RENDERER_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
    warnSpy.mockRestore();
  });

  test('saveConfigToStorage rejects invalid payloads', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(saveConfigToStorage(null)).toBe(false);
    expect(saveConfigToStorage(['nope'])).toBe(false);
    warnSpy.mockRestore();
  });

  test('saveConfigToStorage persists config', () => {
    const ok = saveConfigToStorage(DEFAULT_RENDERER_CONFIG);
    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_RENDERER_CONFIG);
  });

  test('saveConfigToStorage drops backend-owned speech provider values', () => {
    const ok = saveConfigToStorage({
      ...DEFAULT_RENDERER_CONFIG,
      speech_provider: 'local',
    });

    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_RENDERER_CONFIG);
  });

  test('saveConfigToStorage returns false when storage write throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('set-failed');
    });

    expect(saveConfigToStorage(DEFAULT_RENDERER_CONFIG)).toBe(false);
    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('identifies renderer config storage events by storage area and key', () => {
    const event = new StorageEvent('storage', {
      key: CONFIG_KEY,
      storageArea: window.localStorage,
    });
    const unrelatedEvent = new StorageEvent('storage', {
      key: 'unrelated-key',
      storageArea: window.localStorage,
    });

    expect(isRendererConfigStorageEvent(event, window.localStorage)).toBe(true);
    expect(isRendererConfigStorageEvent(unrelatedEvent, window.localStorage)).toBe(false);
  });
});
