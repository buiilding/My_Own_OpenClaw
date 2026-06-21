/**
 * Owns renderer app-config local persistence defaults and normalization.
 */

import { DesktopShortcutRuntimeClient } from './desktopShortcutRuntimeClient';
import {
  DEFAULT_MODEL_SELECTION,
  RENDERER_STORAGE_KEYS,
} from '../skin/desktopRuntimeConfig';
import {
  normalizeAppearanceMode,
  normalizeAppearanceTheme,
} from './desktopAppearanceThemeRuntime';
import {
  normalizeProviderApiKeys,
  stripProviderApiKeySecrets,
} from './desktopProviderCredentialRuntime';

/**
 * Local storage utilities for configuration persistence.
 * 
 * Implements optimistic state pattern:
 * - Loads from localStorage immediately on startup (zero-latency)
 * - Syncs through the settings app-runtime client on connection
 * - Persists to localStorage when runtime settings changes are acknowledged
 */

const CONFIG_STORAGE_KEY = RENDERER_STORAGE_KEYS.config;

const DEFAULT_RENDERER_CONFIG = {
  model_mode: DEFAULT_MODEL_SELECTION.mode,
  model_provider: DEFAULT_MODEL_SELECTION.provider,
  selected_model_id: DEFAULT_MODEL_SELECTION.modelId,
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
  global_agent_stop_shortcut: DesktopShortcutRuntimeClient.normalizeGlobalAgentStopShortcutAccelerator(),
  include_query_screenshot: true,
  provider_api_keys: normalizeProviderApiKeys(),
  appearance_mode: 'system',
  appearance_theme: normalizeAppearanceTheme(),
};

function filterKnownRendererConfigFields(overrides = null) {
  const source = toPlainRecord(overrides);
  const filtered = {};

  for (const key of Object.keys(DEFAULT_RENDERER_CONFIG)) {
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
    return DEFAULT_RENDERER_CONFIG.selected_model_id;
  }

  return selectedModelId;
}

function buildRendererConfig(overrides = {}) {
  const filteredOverrides = filterKnownRendererConfigFields(overrides);
  const normalizedSelectedModelId = normalizeSelectedModelId(filteredOverrides);
  return {
    ...DEFAULT_RENDERER_CONFIG,
    ...filteredOverrides,
    selected_model_id: normalizedSelectedModelId,
    global_agent_stop_shortcut: DesktopShortcutRuntimeClient.normalizeGlobalAgentStopShortcutAccelerator(
      filteredOverrides.global_agent_stop_shortcut,
    ),
    agent_custom_instructions: typeof filteredOverrides.agent_custom_instructions === 'string'
      ? filteredOverrides.agent_custom_instructions
      : DEFAULT_RENDERER_CONFIG.agent_custom_instructions,
    agent_disabled_local_tools: Array.isArray(filteredOverrides.agent_disabled_local_tools)
      ? filteredOverrides.agent_disabled_local_tools.filter((tool) => typeof tool === 'string')
      : DEFAULT_RENDERER_CONFIG.agent_disabled_local_tools,
    agent_disabled_remote_tools: Array.isArray(filteredOverrides.agent_disabled_remote_tools)
      ? filteredOverrides.agent_disabled_remote_tools.filter((tool) => typeof tool === 'string')
      : DEFAULT_RENDERER_CONFIG.agent_disabled_remote_tools,
    agent_enabled_mcp_servers: Array.isArray(filteredOverrides.agent_enabled_mcp_servers)
      ? filteredOverrides.agent_enabled_mcp_servers.filter((serverId) => typeof serverId === 'string')
      : DEFAULT_RENDERER_CONFIG.agent_enabled_mcp_servers,
    provider_api_keys: normalizeProviderApiKeys(filteredOverrides.provider_api_keys),
    appearance_mode: normalizeAppearanceMode(filteredOverrides.appearance_mode),
    appearance_theme: normalizeAppearanceTheme(filteredOverrides.appearance_theme),
  };
}

function stripProviderSecretsForConfigPersistence(config) {
  const normalized = buildRendererConfig(config);

  return {
    ...normalized,
    provider_api_keys: stripProviderApiKeySecrets(normalized.provider_api_keys),
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
      return buildRendererConfig();
    }
    
    const config = JSON.parse(stored);
    
    // Validate that it's an object (basic validation)
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      console.warn('[ConfigStorage] Invalid config format in localStorage, clearing');
      clearStoredConfigUnsafe();
      return buildRendererConfig();
    }
    
    return stripProviderSecretsForConfigPersistence(config);
  } catch (error) {
    console.error('[ConfigStorage] Failed to load config from localStorage:', error);
    // Clear corrupted data
    clearStoredConfigUnsafe();
    return buildRendererConfig();
  }
}

/**
 * Save configuration to localStorage.
 * 
 * @param {Object} config - Configuration object to save
 */
export function saveConfigToStorage(config) {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      console.warn('[ConfigStorage] Attempted to save invalid config:', config);
      return false;
    }

    const normalizedConfig = stripProviderSecretsForConfigPersistence(config);

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));

    return true;
  } catch (error) {
    console.error('[ConfigStorage] Failed to save config to localStorage:', error);
    return false;
  }
}
