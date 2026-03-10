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

export function getPermissionKindLabel(permission) {
  return ACCESS_KIND_LABELS[permission?.access_kind] || 'Access Item';
}

export function getPermissionGrantedLabel(permission) {
  return ACCESS_KIND_GRANTED_LABELS[permission?.access_kind] || 'Granted';
}

export function getPermissionActionLabel(permission) {
  if (typeof permission?.grant_action_label === 'string' && permission.grant_action_label.trim()) {
    return permission.grant_action_label.trim();
  }
  return ACCESS_KIND_ACTION_LABELS[permission?.access_kind] || 'Grant';
}
