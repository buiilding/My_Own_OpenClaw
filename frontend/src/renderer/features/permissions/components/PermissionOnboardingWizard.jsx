import { useMemo } from 'react';
import { CheckCircle2, CircleAlert, Shield } from 'lucide-react';
import { usePermissionStore } from '../stores/permissionStore';
import PermissionRowMain from './PermissionRowMain';

function PermissionRow({ permission, status, onGrant, onRecheck }) {
  return (
    <div className="permission-row">
      <PermissionRowMain permission={permission} status={status} />
      <div className="permission-row-actions">
        <button type="button" onClick={() => onGrant(permission.permission_id)}>
          Grant
        </button>
        <button type="button" className="secondary" onClick={() => onRecheck(permission.permission_id)}>
          Re-check
        </button>
      </div>
    </div>
  );
}

function PermissionOnboardingWizard() {
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const missingRequiredPermissions = usePermissionStore((state) => state.missingRequiredPermissions);
  const error = usePermissionStore((state) => state.error);
  const onboardingState = usePermissionStore((state) => state.onboardingState);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const runPermissionProbe = usePermissionStore((state) => state.runPermissionProbe);
  const recheckAllPermissions = usePermissionStore((state) => state.recheckAllPermissions);
  const setPlannedSystemAccessConsent = usePermissionStore((state) => state.setPlannedSystemAccessConsent);
  const completeOnboarding = usePermissionStore((state) => state.completeOnboarding);

  const requiredPermissions = useMemo(
    () => permissions.filter((permission) => permission.required_now === true),
    [permissions],
  );

  const requiredGranted = missingRequiredPermissions.length === 0;
  const plannedConsent = onboardingState.planned_system_access_consent === true;

  return (
    <div className="permission-onboarding-shell">
      <header className="permission-onboarding-header">
        <div className="permission-onboarding-icon-wrap">
          <Shield size={20} />
        </div>
        <div>
          <h1>Permission Setup Required</h1>
          <p>
            WindieOS needs explicit permission checks before tool-capable usage.
          </p>
        </div>
      </header>

      <section className="permission-onboarding-card">
        <h2>Required now</h2>
        <p>
          Complete these checks before entering normal chat/dashboard usage.
        </p>

        <div className="permission-row-list">
          {requiredPermissions.map((permission) => (
            <PermissionRow
              key={permission.permission_id}
              permission={permission}
              status={statusesByPermissionId[permission.permission_id]}
              onGrant={(permissionId) => {
                void requestPermission(permissionId);
              }}
              onRecheck={(permissionId) => {
                void runPermissionProbe(permissionId);
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="secondary"
          onClick={() => {
            void recheckAllPermissions();
          }}
        >
          Re-check all permissions
        </button>
      </section>

      <section className="permission-onboarding-card">
        <h2>Planned system-access disclosure</h2>
        <p>
          Future system-access mode may require broader machine control. This acknowledgement is separate from runtime grants.
        </p>

        <label className="permission-consent-row">
          <input
            type="checkbox"
            checked={plannedConsent}
            onChange={(event) => setPlannedSystemAccessConsent(event.target.checked)}
          />
          <span>I understand planned system-access scope for future releases.</span>
        </label>
      </section>

      <footer className="permission-onboarding-footer">
        <div className="permission-onboarding-status" aria-live="polite">
          {requiredGranted ? (
            <span><CheckCircle2 size={14} /> Required permissions verified.</span>
          ) : (
            <span><CircleAlert size={14} /> Required permissions still missing.</span>
          )}
        </div>

        <button
          type="button"
          className="primary"
          onClick={() => {
            completeOnboarding();
          }}
          disabled={!requiredGranted || !plannedConsent}
        >
          Continue to WindieOS
        </button>
      </footer>

      {error ? <p className="permission-error">{error}</p> : null}
    </div>
  );
}

export default PermissionOnboardingWizard;
