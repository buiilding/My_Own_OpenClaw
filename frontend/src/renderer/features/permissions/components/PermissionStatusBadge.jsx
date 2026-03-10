import { getPermissionPill } from '../utils/permissionStatus';

function PermissionStatusBadge({ status, permission }) {
  const pill = getPermissionPill(status, permission);
  return <span className={`permission-pill ${pill.className}`.trim()}>{pill.label}</span>;
}

export default PermissionStatusBadge;
