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

const DEFAULT_FRONTEND_CONFIG = {
  model_mode: 'online',
  model_provider: 'openai',
  selected_model_id: 'gpt-5.1',
  interaction_mode: 'chat',
  voice_mode_enabled: false,
  speech_mode_enabled: false,
  wakeword_stt_enabled: false,
  agent_full_sudo_enabled: false,
  include_query_screenshot: true,
  provider_api_keys: DEFAULT_PROVIDER_API_KEYS,
};

function normalizeProviderApiKeys(overrides = null) {
  const source = (
    overrides
    && typeof overrides === 'object'
    && !Array.isArray(overrides)
  ) ? overrides : {};

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

function buildFrontendConfig(overrides = {}) {
  return {
    ...DEFAULT_FRONTEND_CONFIG,
    ...overrides,
    provider_api_keys: normalizeProviderApiKeys(overrides.provider_api_keys),
  };
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
    
    return buildFrontendConfig(config);
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
    
    const configVersion = version !== null ? version : Date.now();
    
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(CONFIG_VERSION_KEY, configVersion.toString());
    
    return true;
  } catch (error) {
    console.error('[ConfigStorage] Failed to save config to localStorage:', error);
    return false;
  }
}
