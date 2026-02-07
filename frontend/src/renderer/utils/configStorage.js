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

export const DEFAULT_FRONTEND_CONFIG = {
  model_mode: 'online',
  model_provider: 'openai',
  selected_model_id: 'gpt-5.1',
  interaction_mode: 'chat',
  voice_mode_enabled: false,
  speech_mode_enabled: false,
};

function buildFrontendConfig(overrides = {}) {
  return { ...DEFAULT_FRONTEND_CONFIG, ...overrides, voice_mode_enabled: false };
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

export function hasStoredConfig() {
  try {
    return localStorage.getItem(CONFIG_STORAGE_KEY) !== null;
  } catch (error) {
    console.error('[ConfigStorage] Failed to read config storage:', error);
    return false;
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

/**
 * Get the stored config version timestamp.
 * 
 * @returns {number|null} - Version timestamp or null if not found
 */
export function getConfigVersion() {
  try {
    const versionStr = localStorage.getItem(CONFIG_VERSION_KEY);
    if (!versionStr) {
      return null;
    }
    
    const version = parseInt(versionStr, 10);
    if (isNaN(version)) {
      return null;
    }
    
    return version;
  } catch (error) {
    console.error('[ConfigStorage] Failed to get config version:', error);
    return null;
  }
}

/**
 * Clear stored configuration from localStorage.
 */
export function clearConfigStorage() {
  try {
    clearStoredConfigUnsafe();
  } catch (error) {
    console.error('[ConfigStorage] Failed to clear config storage:', error);
  }
}
