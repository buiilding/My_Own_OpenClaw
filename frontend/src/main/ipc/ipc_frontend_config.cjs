const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const FRONTEND_CONFIG_FILENAME = 'frontend-config.json';

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
    return parsed;
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
    const filePath = getFrontendConfigPath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, filePath);
    return { success: true };
  } catch (error) {
    log(`Failed to save frontend config to disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadFrontendConfigFromDisk,
  saveFrontendConfigToDisk,
};
