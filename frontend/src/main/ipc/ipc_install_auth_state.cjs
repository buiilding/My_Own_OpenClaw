const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const INSTALL_AUTH_FILENAME = 'install-auth.json';

function getInstallAuthStatePath() {
  return path.join(app.getPath('userData'), INSTALL_AUTH_FILENAME);
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
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(normalized, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, filePath);
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
  normalizeInstallAuthState,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
};
