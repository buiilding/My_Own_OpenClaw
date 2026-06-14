/**
 * Provides the vm mode module for the renderer UI.
 */

export function isVmModeEnabled() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  try {
    const searchParams = new URLSearchParams(window.location.search || '');
    return searchParams.get('vm_mode') === '1';
  } catch (_error) {
    return false;
  }
}
