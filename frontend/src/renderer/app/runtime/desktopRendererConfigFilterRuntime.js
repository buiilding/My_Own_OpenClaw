/**
 * Filters runtime settings down to renderer-managed app-config fields.
 * The renderer only persists its local subset of runtime settings.
 */

/**
 * Fields that the renderer is allowed to manage and persist locally.
 */
const RENDERER_CONFIG_FIELDS = [
  'model_mode',
  'model_provider',
  'selected_model_id',
  'interaction_mode',
  'speech_mode_enabled',
  'wakeword_enabled',
  'wakeword_stt_enabled',
  'show_tool_logs',
  'agent_custom_instructions',
  'agent_disabled_local_tools',
  'agent_disabled_remote_tools',
  'agent_enabled_mcp_servers',
  'browser_automation_enabled',
  'global_agent_stop_shortcut',
  'include_query_screenshot',
  'provider_api_keys',
  'appearance_mode',
  'appearance_theme',
];

/**
 * Filters a configuration object to only include fields that the renderer manages.
 * 
 * @param {Object} config - Full runtime settings/config object
 * @returns {Object} - Filtered configuration with only renderer-managed fields
 */
function filterRendererConfig(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const filtered = {};
  for (const field of RENDERER_CONFIG_FIELDS) {
    if (field in config) {
      filtered[field] = config[field];
    }
  }
  return filtered;
}

export const DesktopRendererConfigFilterRuntime = Object.freeze({
  filterRendererConfig,
});
