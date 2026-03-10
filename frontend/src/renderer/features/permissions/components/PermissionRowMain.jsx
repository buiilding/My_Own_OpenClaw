import PermissionStatusBadge from './PermissionStatusBadge';
import { getPermissionKindLabel } from '../utils/permissionPresentation';

function PermissionRowMain({ permission, status }) {
  return (
    <div className="permission-row-main">
      <div className="permission-row-title-wrap">
        <h3>{permission.label}</h3>
        <PermissionStatusBadge status={status?.status} permission={permission} />
      </div>
      <p className="permission-row-kind">{getPermissionKindLabel(permission)}</p>
      <p>{permission.description}</p>
      {status?.reason ? <p className="permission-row-reason">{status.reason}</p> : null}
    </div>
  );
}

export default PermissionRowMain;
