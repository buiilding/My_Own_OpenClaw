/**
 * Provides the ipc install auth state module for the Electron main process.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { enqueueAtomicWrite } = require('./queued_atomic_write.cjs');

let electronApp = null;
try {
  ({ app: electronApp } = require('electron'));
} catch (_error) {
  electronApp = null;
}

const INSTALL_AUTH_FILENAME = 'install-auth.json';
const INSTALL_AUTH_FILE_MODE = 0o600;
const INSTALL_AUTH_DIR_MODE = 0o700;

function shouldApplyPosixFileModes(platform = process.platform) {
  return platform !== 'win32';
}

function getInstallAuthStatePath() {
  const userDataPath = typeof electronApp?.getPath === 'function'
    ? electronApp.getPath('userData')
    : path.join(os.tmpdir(), 'windieos');
  return path.join(userDataPath, INSTALL_AUTH_FILENAME);
}

async function chmodIfSupported(targetPath, mode) {
  if (!shouldApplyPosixFileModes()) {
    return;
  }
  await fs.promises.chmod(targetPath, mode);
}

async function ensureInstallAuthStateDirectory(filePath) {
  const directoryPath = path.dirname(filePath);
  await fs.promises.mkdir(directoryPath, {
    recursive: true,
    mode: INSTALL_AUTH_DIR_MODE,
  });
  await chmodIfSupported(directoryPath, INSTALL_AUTH_DIR_MODE);
}

async function hardenInstallAuthStatePath(filePath) {
  await chmodIfSupported(path.dirname(filePath), INSTALL_AUTH_DIR_MODE);
  await chmodIfSupported(filePath, INSTALL_AUTH_FILE_MODE);
}

function normalizeInstallAuthState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const installToken = typeof payload.installToken === 'string' ? payload.installToken.trim() : '';
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  const installId = typeof payload.installId === 'string' ? payload.installId.trim() : '';
  if (!installToken || !userId || !installId) {
    return null;
  }
  return {
    installToken,
    userId,
    installId,
  };
}

async function loadInstallAuthStateFromDisk(log) {
  try {
    const filePath = getInstallAuthStatePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const normalized = normalizeInstallAuthState(JSON.parse(raw));
    if (!normalized) {
      log('Install auth state on disk is invalid; ignoring');
      return null;
    }
    await hardenInstallAuthStatePath(filePath);
    return normalized;
  } catch (error) {
    log(`Failed to load install auth state from disk: ${error.message}`);
    return null;
  }
}

async function saveInstallAuthStateToDisk(state, log) {
  try {
    const normalized = normalizeInstallAuthState(state);
    if (!normalized) {
      return { success: false, error: 'Invalid install auth state payload' };
    }
    const filePath = getInstallAuthStatePath();
    await ensureInstallAuthStateDirectory(filePath);
    await enqueueAtomicWrite(filePath, JSON.stringify(normalized, null, 2), {
      encoding: 'utf-8',
      mode: INSTALL_AUTH_FILE_MODE,
    });
    await hardenInstallAuthStatePath(filePath);
    return { success: true, state: normalized };
  } catch (error) {
    log(`Failed to save install auth state to disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function clearInstallAuthStateFromDisk(log) {
  try {
    const filePath = getInstallAuthStatePath();
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    return { success: true };
  } catch (error) {
    log(`Failed to clear install auth state from disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function validateInstallAuthStateWithBackend(state, {
  backendHttpUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalized = normalizeInstallAuthState(state);
  if (!normalized) {
    return {
      valid: false,
      invalidToken: true,
      status: null,
      error: 'Invalid install auth state payload',
    };
  }
  if (typeof fetchImpl !== 'function') {
    return {
      valid: false,
      invalidToken: false,
      status: null,
      error: 'Fetch is not available for install auth validation',
    };
  }
  const normalizedBackendHttpUrl = typeof backendHttpUrl === 'string'
    ? backendHttpUrl.trim().replace(/\/+$/, '')
    : '';
  if (!normalizedBackendHttpUrl) {
    return {
      valid: false,
      invalidToken: false,
      status: null,
      error: 'Backend HTTP URL is required for install auth validation',
    };
  }

  try {
    const response = await fetchImpl(`${normalizedBackendHttpUrl}/api/install/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalized.installToken}`,
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        valid: false,
        invalidToken: response.status === 401,
        status: response.status,
        error: errorText || response.statusText || `HTTP ${response.status}`,
      };
    }
    const payload = await response.json();
    const userId = typeof payload?.user_id === 'string' ? payload.user_id.trim() : '';
    const installId = typeof payload?.install_id === 'string' ? payload.install_id.trim() : '';
    if (!userId || !installId) {
      return {
        valid: false,
        invalidToken: false,
        status: response.status,
        error: 'Install identity response is missing user_id or install_id',
      };
    }
    return {
      valid: true,
      invalidToken: false,
      status: response.status,
      state: {
        installToken: normalized.installToken,
        userId,
        installId,
      },
    };
  } catch (error) {
    return {
      valid: false,
      invalidToken: false,
      status: null,
      error: error?.message || String(error),
    };
  }
}

async function registerInstallWithBackend({
  backendHttpUrl,
  operatingSystem,
  fetchImpl = globalThis.fetch,
  log = () => {},
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for install registration');
  }
  const response = await fetchImpl(`${backendHttpUrl.replace(/\/+$/, '')}/api/install/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operating_system: operatingSystem || null,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Install registration failed (${response.status}): ${errorText}`);
  }
  const payload = await response.json();
  const normalized = normalizeInstallAuthState({
    installToken: payload?.install_token,
    userId: payload?.user_id,
    installId: payload?.install_id,
  });
  if (!normalized) {
    log('Install registration returned an invalid payload');
    throw new Error('Install registration returned an invalid payload');
  }
  return normalized;
}

module.exports = {
  clearInstallAuthStateFromDisk,
  getInstallAuthStatePath,
  loadInstallAuthStateFromDisk,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  validateInstallAuthStateWithBackend,
};
