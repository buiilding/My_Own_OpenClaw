/**
 * Coordinates renderer permission post-grant effects shared by onboarding and settings UI.
 */

const EXTERNAL_GRANT_WATCH_PERMISSION_IDS = new Set([
  'screen_capture',
  'input_control_accessibility',
  'system_events_automation',
  'microphone',
]);

function applyPermissionGrantEffects({ permissionId, status, updateConfig }) {
  if (
    permissionId === 'browser_automation'
    && status?.granted === true
    && typeof updateConfig === 'function'
  ) {
    updateConfig({ browser_automation_enabled: true });
  }
}

function shouldPollPermissionGrantByInterval(permissionId) {
  return EXTERNAL_GRANT_WATCH_PERMISSION_IDS.has(permissionId);
}

function shouldWatchExternalPermissionGrantCompletion(permissionId, status) {
  if (permissionId === 'screen_capture' && status?.details?.media_status === 'granted') {
    return false;
  }
  return (
    shouldPollPermissionGrantByInterval(permissionId)
    && status?.granted !== true
    && status?.status === 'needs-action'
  );
}

export const DesktopPermissionGrantEffectsRuntime = Object.freeze({
  applyPermissionGrantEffects,
  shouldPollPermissionGrantByInterval,
  shouldWatchExternalPermissionGrantCompletion,
});
