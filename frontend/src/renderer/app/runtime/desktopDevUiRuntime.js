/**
 * Provides renderer dev-UI flag helpers for app-runtime consumers.
 */

let cachedDevUiEnabled = null;

function isDevUiEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (cachedDevUiEnabled === null) {
    cachedDevUiEnabled = new URLSearchParams(window.location.search).get('dev_ui') === '1';
  }

  return cachedDevUiEnabled;
}

export const DesktopDevUiRuntime = Object.freeze({
  isDevUiEnabled,
});
