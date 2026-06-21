/**
 * Owns renderer permission status and presentation mapping shared by surfaces.
 */

const ACCESS_KIND_LABELS = Object.freeze({
  os_permission: 'OS Permission',
  app_capability: 'App Capability',
  resource_access: 'Workspace Access',
  runtime_check: 'Runtime Check',
});

const ACCESS_KIND_GRANTED_LABELS = Object.freeze({
  os_permission: 'Granted',
  app_capability: 'Enabled',
  resource_access: 'Configured',
  runtime_check: 'Ready',
});

const ACCESS_KIND_ACTION_LABELS = Object.freeze({
  os_permission: 'Grant',
  app_capability: 'Enable',
  resource_access: 'Choose folder',
  runtime_check: 'Verify',
});

function getPermissionKindLabel(permission) {
  return ACCESS_KIND_LABELS[permission?.access_kind] || 'Access Item';
}

function getPermissionGrantedLabel(permission) {
  return ACCESS_KIND_GRANTED_LABELS[permission?.access_kind] || 'Granted';
}

function getPermissionActionLabel(permission) {
  if (typeof permission?.grant_action_label === 'string' && permission.grant_action_label.trim()) {
    return permission.grant_action_label.trim();
  }
  return ACCESS_KIND_ACTION_LABELS[permission?.access_kind] || 'Grant';
}

function isPermissionGrantedStatus(status) {
  return status?.granted === true || status?.status === 'granted';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function recordsOrEmpty(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function getPermissionManifestEntry(permissions, permissionId, fallback = {}) {
  const normalizedPermissionId = normalizeText(permissionId);
  return recordsOrEmpty(permissions).find(
    (permission) => normalizeText(permission.permission_id) === normalizedPermissionId,
  ) || {
    ...fallback,
    permission_id: normalizedPermissionId,
  };
}

function getPermissionStatusForId(statusesByPermissionId, permissionId) {
  const normalizedPermissionId = normalizeText(permissionId);
  if (
    !normalizedPermissionId
    || !statusesByPermissionId
    || typeof statusesByPermissionId !== 'object'
    || Array.isArray(statusesByPermissionId)
  ) {
    return null;
  }
  return statusesByPermissionId[normalizedPermissionId] || null;
}

function getPermissionStatusDetailsPresentation(status) {
  const reason = normalizeText(status?.reason);
  const statusClassName = `status-${normalizeText(status?.status) || 'unknown'}`;
  const remediation = normalizeText(status?.details?.remediation);
  return {
    reason,
    statusClassName,
    remediation,
  };
}

function getPermissionStatusValue(status) {
  if (typeof status === 'string') {
    return normalizeText(status);
  }
  return normalizeText(status?.status);
}

function getPermissionPill(status, permission) {
  const statusValue = getPermissionStatusValue(status);
  if (statusValue === 'granted') {
    return { label: getPermissionGrantedLabel(permission), className: 'granted' };
  }
  if (statusValue === 'needs-action') {
    return { label: 'Needs action', className: 'warning' };
  }
  if (statusValue === 'unsupported') {
    return { label: 'Unsupported', className: 'warning' };
  }
  return { label: 'Not checked', className: '' };
}

export const DesktopPermissionPresentationRuntime = Object.freeze({
  getPermissionActionLabel,
  getPermissionGrantedLabel,
  getPermissionKindLabel,
  getPermissionManifestEntry,
  getPermissionPill,
  getPermissionStatusDetailsPresentation,
  getPermissionStatusForId,
  getPermissionStatusValue,
  isPermissionGrantedStatus,
});
