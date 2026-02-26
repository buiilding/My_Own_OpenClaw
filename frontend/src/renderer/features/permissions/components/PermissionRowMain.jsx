import PermissionStatusBadge from './PermissionStatusBadge';

function PermissionRowMain({ permission, status }) {
  return (
    <div className="permission-row-main">
      <div className="permission-row-title-wrap">
        <h3>{permission.label}</h3>
        <PermissionStatusBadge status={status?.status} />
      </div>
      <p>{permission.description}</p>
      {status?.reason ? <p className="permission-row-reason">{status.reason}</p> : null}
    </div>
  );
}

export default PermissionRowMain;
