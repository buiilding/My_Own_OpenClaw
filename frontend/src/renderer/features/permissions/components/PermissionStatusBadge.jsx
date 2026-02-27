import { getPermissionPill } from '../utils/permissionStatus';

function PermissionStatusBadge({ status }) {
  const pill = getPermissionPill(status);
  return <span className={`permission-pill ${pill.className}`.trim()}>{pill.label}</span>;
}

export default PermissionStatusBadge;
