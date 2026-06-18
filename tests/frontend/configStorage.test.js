/**
 * Covers config storage. behavior in the frontend test suite.
 */

import {
  loadConfigFromStorage,
  saveConfigToStorage,
} from '../../frontend/src/renderer/utils/configStorage.js';

const CONFIG_KEY = 'windieos-config';
const DEFAULT_FRONTEND_CONFIG = {
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
    openai: { enabled: false, api_key: '' },
    anthropic: { enabled: false, api_key: '' },
    google: { enabled: false, api_key: '' },
    openrouter: { enabled: false, api_key: '' },
    mistral: { enabled: false, api_key: '' },
    kimi_coding: { enabled: false, api_key: '' },
  },
  provider_oauth: {
    openai_codex: {
      connected: false,
      access_token: '',
      refresh_token: '',
      expires_at: null,
      profile_id: '',
    },
  },
  appearance_mode: 'system',
  appearance_theme: {
    light: {
      accent: '#339CFF',
      background: '#FFFFFF',
      foreground: '#1A1C1F',
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 45,
    },
    dark: {
      accent: '#339CFF',
      background: '#181818',
      foreground: '#FFFFFF',
      ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      code_font: 'ui-monospace, "SFMono-Regular", monospace',
      translucent_sidebar: true,
      contrast: 60,
    },
  },
};

describe('configStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loadConfigFromStorage returns defaults when empty', () => {
    expect(loadConfigFromStorage()).toEqual(DEFAULT_FRONTEND_CONFIG);
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
      ...DEFAULT_FRONTEND_CONFIG,
      model_mode: 'offline',
    });
  });

  test('loadConfigFromStorage ignores removed desktop assistant storage key', () => {
    localStorage.setItem(
      'desktop-assistant-config',
      JSON.stringify({ model_mode: 'offline' }),
    );

    expect(loadConfigFromStorage()).toEqual(DEFAULT_FRONTEND_CONFIG);
  });

  test('loadConfigFromStorage normalizes unsupported stored global stop shortcuts', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ global_agent_stop_shortcut: 'CommandOrControl+Alt+/' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
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
      ...DEFAULT_FRONTEND_CONFIG,
      speech_mode_enabled: true,
    });
  });

  test('loadConfigFromStorage drops deprecated renderer-owned speech_provider values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ speech_provider: 'elevenlabs' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
    });
  });

  test('loadConfigFromStorage preserves stored wakeword_enabled value', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ wakeword_enabled: false }),
    );

    const result = loadConfigFromStorage();
    expect(result).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
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
      ...DEFAULT_FRONTEND_CONFIG,
      show_tool_logs: true,
    });
  });

  test('loadConfigFromStorage preserves valid appearance mode and normalizes invalid values', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ appearance_mode: 'dark' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
      appearance_mode: 'dark',
    });

    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ appearance_mode: 'sepia' }),
    );

    expect(loadConfigFromStorage()).toEqual(DEFAULT_FRONTEND_CONFIG);
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
      ...DEFAULT_FRONTEND_CONFIG.appearance_theme.dark,
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
      ...DEFAULT_FRONTEND_CONFIG.provider_api_keys,
      openai: { enabled: true, api_key: '' },
    });
  });

  test('loadConfigFromStorage normalizes provider_oauth with defaults', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        provider_oauth: {
          openai_codex: {
            connected: true,
            access_token: 'codex-access',
            refresh_token: 'codex-refresh',
            expires_at: 12345,
            profile_id: 'openai-codex:default',
          },
        },
      }),
    );

    const result = loadConfigFromStorage();
    expect(result.provider_oauth).toEqual({
      ...DEFAULT_FRONTEND_CONFIG.provider_oauth,
      openai_codex: {
        connected: true,
        access_token: '',
        refresh_token: '',
        expires_at: 12345,
        profile_id: 'openai-codex:default',
      },
    });
  });

  test('saveConfigToStorage strips provider secrets from localStorage', () => {
    const ok = saveConfigToStorage({
      ...DEFAULT_FRONTEND_CONFIG,
      provider_api_keys: {
        ...DEFAULT_FRONTEND_CONFIG.provider_api_keys,
        openai: { enabled: true, api_key: 'sk-openai' },
      },
      provider_oauth: {
        ...DEFAULT_FRONTEND_CONFIG.provider_oauth,
        openai_codex: {
          connected: true,
          access_token: 'codex-access',
          refresh_token: 'codex-refresh',
          expires_at: 12345,
          profile_id: 'openai-codex:default',
        },
      },
    });

    expect(ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY));
    expect(stored.provider_api_keys.openai).toEqual({
      enabled: true,
      api_key: '',
    });
    expect(stored.provider_oauth.openai_codex).toEqual({
      connected: true,
      access_token: '',
      refresh_token: '',
      expires_at: 12345,
      profile_id: 'openai-codex:default',
    });
    expect(JSON.stringify(stored)).not.toContain('sk-openai');
    expect(JSON.stringify(stored)).not.toContain('codex-access');
    expect(JSON.stringify(stored)).not.toContain('codex-refresh');
  });

  test('loadConfigFromStorage clears invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, '{bad json');
    const result = loadConfigFromStorage();
    expect(result).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
  });

  test('loadConfigFromStorage clears non-object payloads', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(['array-not-allowed']));

    const result = loadConfigFromStorage();

    expect(result).toEqual(DEFAULT_FRONTEND_CONFIG);
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
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG);
    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_FRONTEND_CONFIG);
  });

  test('saveConfigToStorage drops backend-owned speech provider values', () => {
    const ok = saveConfigToStorage({
      ...DEFAULT_FRONTEND_CONFIG,
      speech_provider: 'local',
    });

    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_FRONTEND_CONFIG);
  });

  test('saveConfigToStorage returns false when storage write throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('set-failed');
    });

    expect(saveConfigToStorage(DEFAULT_FRONTEND_CONFIG)).toBe(false);
    setItemSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
