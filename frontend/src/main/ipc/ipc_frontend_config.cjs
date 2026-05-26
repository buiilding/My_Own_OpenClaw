const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { enqueueAtomicWrite } = require('./queued_atomic_write.cjs');

const FRONTEND_CONFIG_FILENAME = 'frontend-config.json';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function redactProviderSecretsFromFrontendConfig(config) {
  if (!isPlainObject(config)) {
    return config;
  }

  const redacted = { ...config };
  if (isPlainObject(redacted.provider_api_keys)) {
    redacted.provider_api_keys = Object.fromEntries(
      Object.entries(redacted.provider_api_keys).map(([provider, entry]) => [
        provider,
        isPlainObject(entry)
          ? { ...entry, api_key: '' }
          : entry,
      ]),
    );
  }
  if (isPlainObject(redacted.provider_oauth)) {
    redacted.provider_oauth = Object.fromEntries(
      Object.entries(redacted.provider_oauth).map(([provider, entry]) => [
        provider,
        isPlainObject(entry)
          ? { ...entry, access_token: '', refresh_token: '' }
          : entry,
      ]),
    );
  }

  return redacted;
}

function getFrontendConfigPath() {
  return path.join(app.getPath('userData'), FRONTEND_CONFIG_FILENAME);
}

async function loadFrontendConfigFromDisk(log) {
  try {
    const filePath = getFrontendConfigPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log('Frontend config on disk is invalid; ignoring');
      return null;
    }
    return redactProviderSecretsFromFrontendConfig(parsed);
  } catch (error) {
    log(`Failed to load frontend config from disk: ${error.message}`);
    return null;
  }
}

async function saveFrontendConfigToDisk(config, log) {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { success: false, error: 'Invalid config payload' };
    }
    const redactedConfig = redactProviderSecretsFromFrontendConfig(config);
    const filePath = getFrontendConfigPath();
    await enqueueAtomicWrite(filePath, JSON.stringify(redactedConfig, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    log(`Failed to save frontend config to disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadFrontendConfigFromDisk,
  redactProviderSecretsFromFrontendConfig,
  saveFrontendConfigToDisk,
};
