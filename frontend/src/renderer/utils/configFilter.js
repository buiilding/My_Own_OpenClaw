/**
 * Utility functions for filtering frontend configuration.
 * The frontend only needs a subset of the backend configuration.
 */

/**
 * Fields that the frontend is allowed to manage and send to the backend.
 */
const FRONTEND_CONFIG_FIELDS = [
  'model_mode',
  'model_provider',
  'selected_model_id',
  'interaction_mode',
  'voice_mode_enabled',
  'speech_mode_enabled',
  'include_query_screenshot',
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

/**
 * Checks if a configuration object contains only frontend-managed fields.
 * 
 * @param {Object} config - Configuration object to check
 * @returns {boolean} - True if config only contains frontend-managed fields
 */
export function isFrontendConfigOnly(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const keys = Object.keys(config);
  return keys.every(key => FRONTEND_CONFIG_FIELDS.includes(key));
}
