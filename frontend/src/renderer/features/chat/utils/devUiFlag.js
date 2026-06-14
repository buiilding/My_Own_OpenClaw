/**
 * Provides the dev ui flag module for the renderer UI.
 */

let cachedDevUiEnabled = null;

export function isDevUiEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (cachedDevUiEnabled === null) {
    cachedDevUiEnabled = new URLSearchParams(window.location.search).get('dev_ui') === '1';
  }

  return cachedDevUiEnabled;
}
