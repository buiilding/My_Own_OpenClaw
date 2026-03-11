export function applyPermissionGrantEffects({ permissionId, status, updateConfig }) {
  if (
    permissionId === 'browser_automation'
    && status?.granted === true
    && typeof updateConfig === 'function'
  ) {
    updateConfig({ browser_automation_enabled: true });
  }
}
