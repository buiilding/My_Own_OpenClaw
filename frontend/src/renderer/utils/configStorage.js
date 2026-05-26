import { normalizeGlobalAgentStopShortcutAccelerator } from '../infrastructure/shortcuts/agentStopShortcut';

/**
 * Local storage utilities for configuration persistence.
 * 
 * Implements optimistic state pattern:
 * - Loads from localStorage immediately on startup (zero-latency)
 * - Syncs with backend on connection (handshake)
 * - Persists to localStorage when backend confirms changes
 */

const CONFIG_STORAGE_KEY = 'desktop-assistant-config';
const CONFIG_VERSION_KEY = 'desktop-assistant-config-version';

const DEFAULT_PROVIDER_API_KEYS = {
  openai: { enabled: false, api_key: '' },
  anthropic: { enabled: false, api_key: '' },
  google: { enabled: false, api_key: '' },
  openrouter: { enabled: false, api_key: '' },
  mistral: { enabled: false, api_key: '' },
  kimi_coding: { enabled: false, api_key: '' },
};

const DEFAULT_PROVIDER_OAUTH = {
  openai_codex: {
    connected: false,
    access_token: '',
    refresh_token: '',
    expires_at: null,
    profile_id: '',
  },
};

export const DEFAULT_APPEARANCE_THEME = Object.freeze({
  light: Object.freeze({
    accent: '#339CFF',
    background: '#FFFFFF',
    foreground: '#1A1C1F',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 45,
  }),
  dark: Object.freeze({
    accent: '#339CFF',
    background: '#181818',
    foreground: '#FFFFFF',
    ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code_font: 'ui-monospace, "SFMono-Regular", monospace',
    translucent_sidebar: true,
    contrast: 60,
  }),
});

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
  agent_custom_instructions: '',
  agent_disabled_local_tools: [],
  agent_disabled_remote_tools: [],
  browser_automation_enabled: false,
  global_agent_stop_shortcut: normalizeGlobalAgentStopShortcutAccelerator(),
  include_query_screenshot: true,
  provider_api_keys: DEFAULT_PROVIDER_API_KEYS,
  provider_oauth: DEFAULT_PROVIDER_OAUTH,
  appearance_mode: 'system',
  appearance_theme: DEFAULT_APPEARANCE_THEME,
};

const LEGACY_MODEL_ID_MIGRATIONS = Object.freeze({
  'gpt-5': 'gpt-5.4@@gpt-5-4-none-thinking',
  'gpt-5@@gpt-5-nonthinking': 'gpt-5.4@@gpt-5-4-none-thinking',
});

function normalizeProviderApiKeys(overrides = null) {
  const source = toPlainRecord(overrides);

  const normalized = {};
  for (const [provider, defaultEntry] of Object.entries(DEFAULT_PROVIDER_API_KEYS)) {
    const candidate = (
      source[provider]
      && typeof source[provider] === 'object'
      && !Array.isArray(source[provider])
    ) ? source[provider] : {};
    normalized[provider] = {
      enabled: candidate.enabled === true,
      api_key: typeof candidate.api_key === 'string' ? candidate.api_key : defaultEntry.api_key,
    };
  }
  return normalized;
}

function normalizeProviderOAuth(overrides = null) {
  const source = toPlainRecord(overrides);

  const normalized = {};
  for (const [provider, defaultEntry] of Object.entries(DEFAULT_PROVIDER_OAUTH)) {
    const candidate = (
      source[provider]
      && typeof source[provider] === 'object'
      && !Array.isArray(source[provider])
    ) ? source[provider] : {};
    const expiresAt = (
      typeof candidate.expires_at === 'number'
      && Number.isFinite(candidate.expires_at)
    ) ? candidate.expires_at : defaultEntry.expires_at;
    normalized[provider] = {
      connected: candidate.connected === true,
      access_token: typeof candidate.access_token === 'string'
        ? candidate.access_token
        : defaultEntry.access_token,
      refresh_token: typeof candidate.refresh_token === 'string'
        ? candidate.refresh_token
        : defaultEntry.refresh_token,
      expires_at: expiresAt,
      profile_id: typeof candidate.profile_id === 'string'
        ? candidate.profile_id
        : defaultEntry.profile_id,
    };
  }

  return normalized;
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeAppearanceThemeSection(overrides = null, defaults) {
  const source = toPlainRecord(overrides);
  const contrast = Number(source.contrast);
  const normalizedContrast = Number.isFinite(contrast)
    ? Math.min(100, Math.max(0, Math.round(contrast)))
    : defaults.contrast;

  return {
    accent: normalizeHexColor(source.accent, defaults.accent),
    background: normalizeHexColor(source.background, defaults.background),
    foreground: normalizeHexColor(source.foreground, defaults.foreground),
    ui_font: typeof source.ui_font === 'string' && source.ui_font.trim()
      ? source.ui_font
      : defaults.ui_font,
    code_font: typeof source.code_font === 'string' && source.code_font.trim()
      ? source.code_font
      : defaults.code_font,
    translucent_sidebar: typeof source.translucent_sidebar === 'boolean'
      ? source.translucent_sidebar
      : defaults.translucent_sidebar,
    contrast: normalizedContrast,
  };
}

function normalizeAppearanceTheme(overrides = null) {
  const source = toPlainRecord(overrides);
  return {
    light: normalizeAppearanceThemeSection(source.light, DEFAULT_APPEARANCE_THEME.light),
    dark: normalizeAppearanceThemeSection(source.dark, DEFAULT_APPEARANCE_THEME.dark),
  };
}

function normalizeAppearanceMode(value) {
  return ['light', 'dark', 'system'].includes(value) ? value : DEFAULT_FRONTEND_CONFIG.appearance_mode;
}

function filterKnownFrontendConfigFields(overrides = null) {
  const source = toPlainRecord(overrides);
  const filtered = {};

  for (const key of Object.keys(DEFAULT_FRONTEND_CONFIG)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      filtered[key] = source[key];
    }
  }

  return filtered;
}

function normalizeSelectedModelId(overrides = {}) {
  const selectedModelId = typeof overrides.selected_model_id === 'string'
    ? overrides.selected_model_id.trim()
    : '';
  if (!selectedModelId) {
    return DEFAULT_FRONTEND_CONFIG.selected_model_id;
  }

  return LEGACY_MODEL_ID_MIGRATIONS[selectedModelId] || selectedModelId;
}

function buildFrontendConfig(overrides = {}) {
  const filteredOverrides = filterKnownFrontendConfigFields(overrides);
  const normalizedSelectedModelId = normalizeSelectedModelId(filteredOverrides);
  return {
    ...DEFAULT_FRONTEND_CONFIG,
    ...filteredOverrides,
    selected_model_id: normalizedSelectedModelId,
    global_agent_stop_shortcut: normalizeGlobalAgentStopShortcutAccelerator(
      filteredOverrides.global_agent_stop_shortcut,
    ),
    agent_custom_instructions: typeof filteredOverrides.agent_custom_instructions === 'string'
      ? filteredOverrides.agent_custom_instructions
      : DEFAULT_FRONTEND_CONFIG.agent_custom_instructions,
    agent_disabled_local_tools: Array.isArray(filteredOverrides.agent_disabled_local_tools)
      ? filteredOverrides.agent_disabled_local_tools.filter((tool) => typeof tool === 'string')
      : DEFAULT_FRONTEND_CONFIG.agent_disabled_local_tools,
    agent_disabled_remote_tools: Array.isArray(filteredOverrides.agent_disabled_remote_tools)
      ? filteredOverrides.agent_disabled_remote_tools.filter((tool) => typeof tool === 'string')
      : DEFAULT_FRONTEND_CONFIG.agent_disabled_remote_tools,
    provider_api_keys: normalizeProviderApiKeys(filteredOverrides.provider_api_keys),
    provider_oauth: normalizeProviderOAuth(filteredOverrides.provider_oauth),
    appearance_mode: normalizeAppearanceMode(filteredOverrides.appearance_mode),
    appearance_theme: normalizeAppearanceTheme(filteredOverrides.appearance_theme),
  };
}

export function stripProviderSecretsForConfigPersistence(config) {
  const normalized = buildFrontendConfig(config);
  const providerApiKeys = {};
  for (const [provider, entry] of Object.entries(normalized.provider_api_keys)) {
    providerApiKeys[provider] = {
      ...entry,
      api_key: '',
    };
  }

  const providerOauth = {};
  for (const [provider, entry] of Object.entries(normalized.provider_oauth)) {
    providerOauth[provider] = {
      ...entry,
      access_token: '',
      refresh_token: '',
    };
  }

  return {
    ...normalized,
    provider_api_keys: providerApiKeys,
    provider_oauth: providerOauth,
  };
}

function toPlainRecord(value) {
  return (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  ) ? value : {};
}

function clearStoredConfigUnsafe() {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  localStorage.removeItem(CONFIG_VERSION_KEY);
}

/**
 * Load configuration from localStorage.
 * 
 * @returns {Object|null} - Stored config object or null if not found/invalid
 */
export function loadConfigFromStorage() {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!stored) {
      return buildFrontendConfig();
    }
    
    const config = JSON.parse(stored);
    
    // Validate that it's an object (basic validation)
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      console.warn('[ConfigStorage] Invalid config format in localStorage, clearing');
      clearStoredConfigUnsafe();
      return buildFrontendConfig();
    }
    
    return stripProviderSecretsForConfigPersistence(config);
  } catch (error) {
    console.error('[ConfigStorage] Failed to load config from localStorage:', error);
    // Clear corrupted data
    clearStoredConfigUnsafe();
    return buildFrontendConfig();
  }
}

/**
 * Save configuration to localStorage.
 * 
 * @param {Object} config - Configuration object to save
 * @param {number} [version] - Optional version timestamp (defaults to Date.now())
 */
export function saveConfigToStorage(config, version = null) {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      console.warn('[ConfigStorage] Attempted to save invalid config:', config);
      return false;
    }

    const normalizedConfig = stripProviderSecretsForConfigPersistence(config);
    const configVersion = version !== null ? version : Date.now();

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));
    localStorage.setItem(CONFIG_VERSION_KEY, configVersion.toString());

    return true;
  } catch (error) {
    console.error('[ConfigStorage] Failed to save config to localStorage:', error);
    return false;
  }
}
