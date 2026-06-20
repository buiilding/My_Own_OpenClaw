/**
 * Resolves generic desktop host operating-system names for main-process payloads.
 */

function resolveDesktopHostOperatingSystem(platformName = process.platform) {
  switch (platformName) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return typeof platformName === 'string' && platformName.trim().length > 0
        ? platformName.trim()
        : null;
  }
}

module.exports = {
  resolveDesktopHostOperatingSystem,
};
