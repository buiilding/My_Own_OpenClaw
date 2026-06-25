/**
 * Defines desktop UI config disk persistence for the Electron main process.
 */

const fs = require('fs');
const path = require('path');
const { enqueueAtomicWrite } = require('./queued_atomic_write.cjs');
const { app } = require('electron');
const {
  hydrateProviderApiKeySecrets,
  persistProviderApiKeySecrets,
} = require('./ipc_provider_credentials_store.cjs');

const DESKTOP_UI_CONFIG_FILENAME = 'frontend-config.json';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redactProviderSecretsFromDesktopUiConfig(config) {
  if (!isPlainObject(config)) {
    return config;
  }

  const redacted = { ...config };
  if (isPlainObject(redacted.provider_api_keys)) {
    redacted.provider_api_keys = Object.fromEntries(
      Object.entries(redacted.provider_api_keys).map(([provider, entry]) => {
        if (!isPlainObject(entry)) {
          return [provider, entry];
        }
        const { clear_saved_key: _clearSavedKey, ...entryWithoutClearSignal } = entry;
        return [
          provider,
          {
            ...entryWithoutClearSignal,
            api_key: '',
            has_saved_key: entry.enabled === true
              && entry.clear_saved_key !== true
              && (
                entry.has_saved_key === true
                || (typeof entry.api_key === 'string' && entry.api_key.length > 0)
              ),
          },
        ];
      }),
    );
  }
  delete redacted.provider_oauth;

  return redacted;
}

function getDesktopUiConfigPath() {
  return path.join(app.getPath('userData'), DESKTOP_UI_CONFIG_FILENAME);
}

async function loadDesktopUiConfigFromDisk(log) {
  try {
    const filePath = getDesktopUiConfigPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log('Desktop UI config on disk is invalid; ignoring');
      return null;
    }
    return hydrateProviderApiKeySecrets(redactProviderSecretsFromDesktopUiConfig(parsed), log);
  } catch (error) {
    log(`Failed to load desktop UI config from disk: ${error.message}`);
    return null;
  }
}

function loadDesktopUiConfigFromDiskSync(log) {
  try {
    const filePath = getDesktopUiConfigPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log('Desktop UI config on disk is invalid; ignoring');
      return null;
    }
    return hydrateProviderApiKeySecrets(redactProviderSecretsFromDesktopUiConfig(parsed), log);
  } catch (error) {
    log(`Failed to synchronously load desktop UI config from disk: ${error.message}`);
    return null;
  }
}

async function saveDesktopUiConfigToDisk(config, log) {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { success: false, error: 'Invalid config payload' };
    }
    const credentialsResult = await persistProviderApiKeySecrets(config, log);
    if (credentialsResult?.success === false) {
      return credentialsResult;
    }
    const redactedConfig = redactProviderSecretsFromDesktopUiConfig(config);
    const filePath = getDesktopUiConfigPath();
    await enqueueAtomicWrite(filePath, JSON.stringify(redactedConfig, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    log(`Failed to save desktop UI config to disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadDesktopUiConfigFromDisk,
  loadDesktopUiConfigFromDiskSync,
  redactDesktopUiConfigProviderSecrets: redactProviderSecretsFromDesktopUiConfig,
  saveDesktopUiConfigToDisk,
};
