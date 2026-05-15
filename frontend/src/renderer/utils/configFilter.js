/**
 * Utility functions for filtering frontend configuration.
 * The frontend only needs a subset of the backend configuration.
 */

/**
 * Fields that the frontend is allowed to manage and persist locally.
 */
const FRONTEND_CONFIG_FIELDS = [
  'model_mode',
  'model_provider',
  'selected_model_id',
  'interaction_mode',
  'speech_mode_enabled',
  'wakeword_enabled',
  'wakeword_stt_enabled',
  'agent_full_sudo_enabled',
  'show_tool_logs',
  'agent_custom_instructions',
  'agent_disabled_local_tools',
  'agent_disabled_remote_tools',
  'browser_automation_enabled',
  'global_agent_stop_shortcut',
  'include_query_screenshot',
  'provider_api_keys',
  'provider_oauth',
];

/**
 * Filters a configuration object to only include fields that the frontend manages.
 * 
 * @param {Object} config - The full configuration object from backend
 * @returns {Object} - Filtered configuration with only frontend-managed fields
 */
export function filterFrontendConfig(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const filtered = {};
  for (const field of FRONTEND_CONFIG_FIELDS) {
    if (field in config) {
      filtered[field] = config[field];
    }
  }
  return filtered;
}
