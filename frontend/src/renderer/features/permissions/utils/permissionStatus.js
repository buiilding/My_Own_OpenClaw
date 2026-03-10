import { getPermissionGrantedLabel } from './permissionPresentation';

function getPermissionPill(status, permission) {
  if (status === 'granted') {
    return { label: getPermissionGrantedLabel(permission), className: 'granted' };
  }
  if (status === 'needs-action') {
    return { label: 'Needs action', className: 'warning' };
  }
  if (status === 'unsupported') {
    return { label: 'Unsupported', className: 'warning' };
  }
  return { label: 'Not checked', className: '' };
}

export { getPermissionPill };
