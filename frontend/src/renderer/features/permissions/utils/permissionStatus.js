function getPermissionPill(status) {
  if (status === 'granted') {
    return { label: 'Granted', className: 'granted' };
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
