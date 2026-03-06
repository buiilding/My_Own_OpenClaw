import { useEffect } from 'react';
import { RefreshCcw, Shield } from 'lucide-react';
import { usePermissionStore } from '../stores/permissionStore';
import PermissionRowMain from './PermissionRowMain';

function PermissionControlCenter() {
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const isLoading = usePermissionStore((state) => state.isLoading);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const runPermissionProbe = usePermissionStore((state) => state.runPermissionProbe);
  const recheckAllPermissions = usePermissionStore((state) => state.recheckAllPermissions);

  useEffect(() => {
    if (!bootstrapped) {
      void bootstrapPermissions();
    }
  }, [bootstrapped, bootstrapPermissions]);

  return (
    <div className="clone-settings-general">
      <h2>Permissions</h2>
      <p>Live capability status used by onboarding and runtime gating.</p>

      <button
        type="button"
        className="clone-settings-inline-action"
        onClick={() => {
          void recheckAllPermissions();
        }}
        disabled={isLoading}
      >
        <RefreshCcw size={12} />
        Re-run checks
      </button>

      <div className="permission-row-list settings">
        {permissions.map((permission) => {
          const status = statusesByPermissionId[permission.permission_id];
          return (
            <div key={permission.permission_id} className="permission-row settings">
              <PermissionRowMain permission={permission} status={status} />
              <div className="permission-row-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void runPermissionProbe(permission.permission_id);
                  }}
                >
                  Re-check
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="permission-error">
          <Shield size={12} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default PermissionControlCenter;
