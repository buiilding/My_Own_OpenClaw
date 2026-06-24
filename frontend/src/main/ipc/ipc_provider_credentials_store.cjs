/**
 * Stores renderer-managed provider credentials in Electron main user data.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { enqueueAtomicWrite } = require('./queued_atomic_write.cjs');

const PROVIDER_CREDENTIALS_FILENAME = 'provider-credentials.json';
const STORE_VERSION = 1;
const ENCODING = 'electron-safe-storage-v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getProviderCredentialsPath() {
  return path.join(app.getPath('userData'), PROVIDER_CREDENTIALS_FILENAME);
}

function canUseSafeStorage(storage = safeStorage) {
  return Boolean(
    storage
      && typeof storage.encryptString === 'function'
      && typeof storage.decryptString === 'function'
      && (
        typeof storage.isEncryptionAvailable !== 'function'
        || storage.isEncryptionAvailable()
      ),
  );
}

function readProviderCredentialsStore(log = () => {}) {
  try {
    const filePath = getProviderCredentialsPath();
    if (!fs.existsSync(filePath)) {
      return { version: STORE_VERSION, provider_api_keys: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!isPlainObject(parsed)) {
      log('Provider credential store on disk is invalid; ignoring');
      return { version: STORE_VERSION, provider_api_keys: {} };
    }
    return {
      version: STORE_VERSION,
      provider_api_keys: isPlainObject(parsed.provider_api_keys)
        ? parsed.provider_api_keys
        : {},
    };
  } catch (error) {
    log(`Failed to load provider credential store: ${error.message}`);
    return { version: STORE_VERSION, provider_api_keys: {} };
  }
}

function encryptedEntryForSecret(secret, storage = safeStorage) {
  return {
    encoding: ENCODING,
    encrypted: storage.encryptString(secret).toString('base64'),
  };
}

function decryptProviderSecret(entry, storage = safeStorage) {
  if (!isPlainObject(entry) || entry.encoding !== ENCODING || typeof entry.encrypted !== 'string') {
    return null;
  }
  return storage.decryptString(Buffer.from(entry.encrypted, 'base64'));
}

async function writeProviderCredentialsStore(store) {
  await enqueueAtomicWrite(
    getProviderCredentialsPath(),
    JSON.stringify({
      version: STORE_VERSION,
      provider_api_keys: isPlainObject(store.provider_api_keys)
        ? store.provider_api_keys
        : {},
    }, null, 2),
    'utf-8',
  );
}

async function persistProviderApiKeySecrets(config, log = () => {}, storage = safeStorage) {
  if (!isPlainObject(config?.provider_api_keys)) {
    return { success: true, changed: false };
  }
  if (!canUseSafeStorage(storage)) {
    log('Provider API keys were not persisted because Electron safeStorage is unavailable');
    return { success: false, error: 'Provider credential encryption unavailable' };
  }

  const store = readProviderCredentialsStore(log);
  const nextSecrets = isPlainObject(store.provider_api_keys)
    ? { ...store.provider_api_keys }
    : {};
  let changed = false;

  for (const [provider, entry] of Object.entries(config.provider_api_keys)) {
    if (!isPlainObject(entry)) {
      continue;
    }
    if (entry.enabled === false) {
      if (Object.prototype.hasOwnProperty.call(nextSecrets, provider)) {
        delete nextSecrets[provider];
        changed = true;
      }
      continue;
    }
    if (typeof entry.api_key === 'string' && entry.api_key.length > 0) {
      nextSecrets[provider] = encryptedEntryForSecret(entry.api_key, storage);
      changed = true;
    }
  }

  if (!changed) {
    return { success: true, changed: false };
  }

  await writeProviderCredentialsStore({
    version: STORE_VERSION,
    provider_api_keys: nextSecrets,
  });
  return { success: true, changed: true };
}

function hydrateProviderApiKeySecrets(config, log = () => {}, storage = safeStorage) {
  if (!isPlainObject(config) || !isPlainObject(config.provider_api_keys)) {
    return config;
  }
  if (!canUseSafeStorage(storage)) {
    return config;
  }

  const store = readProviderCredentialsStore(log);
  if (!isPlainObject(store.provider_api_keys)) {
    return config;
  }

  let changed = false;
  const providerApiKeys = Object.fromEntries(
    Object.entries(config.provider_api_keys).map(([provider, entry]) => {
      if (!isPlainObject(entry) || entry.enabled !== true || entry.api_key) {
        return [provider, entry];
      }
      const secret = decryptProviderSecret(store.provider_api_keys[provider], storage);
      if (!secret) {
        return [provider, entry];
      }
      changed = true;
      return [provider, { ...entry, api_key: secret }];
    }),
  );

  return changed
    ? { ...config, provider_api_keys: providerApiKeys }
    : config;
}

module.exports = {
  getProviderCredentialsPath,
  hydrateProviderApiKeySecrets,
  persistProviderApiKeySecrets,
};
