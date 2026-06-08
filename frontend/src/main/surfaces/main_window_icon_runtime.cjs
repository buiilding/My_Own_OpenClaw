const { nativeImage } = require('electron');
const fs = require('fs');
const nodePath = require('path');

const APP_ICON_RELATIVE_PATH = nodePath.join('src', 'main', 'assets', 'icons', 'windieos.app.png');
const TRAY_ICON_FALLBACK_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function resolveAppIconPathRuntime({
  existsSync = fs.existsSync,
  resourcesPath = process.resourcesPath,
  cwd = process.cwd(),
} = {}) {
  const candidates = [
    nodePath.join(__dirname, '..', 'assets', 'icons', 'windieos.app.png'),
    resourcesPath ? nodePath.join(resourcesPath, APP_ICON_RELATIVE_PATH) : null,
    cwd ? nodePath.join(cwd, APP_ICON_RELATIVE_PATH) : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveTrayIconNativeImage({
  iconPath,
  warn = console.warn,
} = {}) {
  if (iconPath && typeof nativeImage.createFromPath === 'function') {
    const resolvedIcon = nativeImage.createFromPath(iconPath);
    if (resolvedIcon && typeof resolvedIcon.isEmpty === 'function' && !resolvedIcon.isEmpty()) {
      return resolvedIcon;
    }
    warn(`[Main] Tray icon path was empty or unreadable: ${iconPath}`);
  }
  return nativeImage.createFromDataURL(TRAY_ICON_FALLBACK_DATA_URL);
}

function resolveAppIconNativeImage({
  resolveAppIconPath = resolveAppIconPathRuntime,
  warn = console.warn,
} = {}) {
  const iconPath = resolveAppIconPath();
  if (!iconPath || typeof nativeImage.createFromPath !== 'function') {
    return null;
  }
  const resolvedIcon = nativeImage.createFromPath(iconPath);
  if (resolvedIcon && typeof resolvedIcon.isEmpty === 'function' && !resolvedIcon.isEmpty()) {
    return resolvedIcon;
  }
  warn(`[Main] App icon path was empty or unreadable: ${iconPath}`);
  return null;
}

module.exports = {
  resolveAppIconNativeImage,
  resolveAppIconPathRuntime,
  resolveTrayIconNativeImage,
};
