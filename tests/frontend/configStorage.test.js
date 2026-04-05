import {
  loadConfigFromStorage,
  saveConfigToStorage,
} from '../../frontend/src/renderer/utils/configStorage.js';

const CONFIG_KEY = 'desktop-assistant-config';
const VERSION_KEY = 'desktop-assistant-config-version';
const DEFAULT_FRONTEND_CONFIG = {
  model_mode: 'online',
  model_provider: 'openai',
  selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
  interaction_mode: 'agent',
  speech_mode_enabled: false,
  wakeword_enabled: true,
  wakeword_stt_enabled: false,
  agent_full_sudo_enabled: false,
  show_tool_logs: false,
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

  test('loadConfigFromStorage migrates legacy OpenAI default model ids to GPT-5.4', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ selected_model_id: 'gpt-5@@gpt-5-nonthinking' }),
    );

    expect(loadConfigFromStorage()).toEqual({
      ...DEFAULT_FRONTEND_CONFIG,
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
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
      openai: { enabled: true, api_key: 'sk-openai' },
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
        access_token: 'codex-access',
        refresh_token: 'codex-refresh',
        expires_at: 12345,
        profile_id: 'openai-codex:default',
      },
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
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_FRONTEND_CONFIG);
    expect(localStorage.getItem(VERSION_KEY)).toBe('123');
  });

  test('saveConfigToStorage drops backend-owned speech provider values', () => {
    const ok = saveConfigToStorage({
      ...DEFAULT_FRONTEND_CONFIG,
      speech_provider: 'local',
    }, 123);

    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY))).toEqual(DEFAULT_FRONTEND_CONFIG);
  });

  test('saveConfigToStorage uses Date.now when version omitted', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(456);
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG);
    expect(ok).toBe(true);
    expect(localStorage.getItem(VERSION_KEY)).toBe('456');
    nowSpy.mockRestore();
  });

  test('saveConfigToStorage uses Date.now when version is null', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(789);
    const ok = saveConfigToStorage(DEFAULT_FRONTEND_CONFIG, null);
    expect(ok).toBe(true);
    expect(localStorage.getItem(VERSION_KEY)).toBe('789');
    nowSpy.mockRestore();
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
});
