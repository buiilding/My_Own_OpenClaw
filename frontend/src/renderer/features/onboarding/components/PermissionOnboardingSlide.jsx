import PropTypes from 'prop-types';
import {
  getPermissionActionLabel,
  getPermissionGrantedLabel,
  getPermissionKindLabel,
} from '../../permissions/utils/permissionPresentation';

function PermissionOnboardingSlide({
  activePermission = null,
  bootstrapped,
  currentPermissionIndex,
  isLoading,
  pendingPermissionId,
  permissionCount,
  status = null,
  onGrantPermission,
}) {
  if (!activePermission) {
    return (
      <div className="frontend-onboarding-permissions-section">
        <p className="frontend-onboarding-permission-empty">
          {bootstrapped ? 'No permission items were returned by the manifest.' : 'Loading permissions...'}
        </p>
      </div>
    );
  }

  const statusReason = typeof status?.reason === 'string' ? status.reason.trim() : '';
  const isGranted = status?.granted === true || status?.status === 'granted';
  const isPending = pendingPermissionId === activePermission.permission_id;
  const actionLabel = getPermissionActionLabel(activePermission);
  const grantedLabel = getPermissionGrantedLabel(activePermission);

  return (
    <div className="frontend-onboarding-permissions-section">
      <div className="frontend-onboarding-permission-stage-meta">
        <p className="frontend-onboarding-permission-stage-count">
          Permission {currentPermissionIndex} of {permissionCount}
        </p>
        <p className="frontend-onboarding-permission-stage-summary">
          Grant what you want now. You can revisit the rest later in Settings.
        </p>
      </div>
      <div className="frontend-onboarding-permissions-list single">
        <article className="frontend-onboarding-permission-row single">
          <div className="frontend-onboarding-permission-copy">
            <h2>{activePermission.label}</h2>
            <p className="frontend-onboarding-permission-kind">
              {getPermissionKindLabel(activePermission)}
            </p>
            <p>{activePermission.description}</p>
            {statusReason ? (
              <p className={`frontend-onboarding-permission-reason status-${status?.status || 'unknown'}`}>
                {statusReason}
              </p>
            ) : null}
          </div>
          {isGranted ? (
            <div className="frontend-onboarding-permission-granted" aria-label={grantedLabel}>
              <span className="frontend-onboarding-permission-granted-icon" aria-hidden="true">✓</span>
              <span>{grantedLabel}</span>
            </div>
          ) : (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={() => {
                void onGrantPermission(activePermission.permission_id);
              }}
              disabled={isLoading || isPending}
            >
              {isPending ? `${actionLabel}...` : actionLabel}
            </button>
          )}
        </article>
      </div>
    </div>
  );
}

PermissionOnboardingSlide.propTypes = {
  activePermission: PropTypes.shape({
    description: PropTypes.string,
    label: PropTypes.string,
    permission_id: PropTypes.string,
  }),
  bootstrapped: PropTypes.bool.isRequired,
  currentPermissionIndex: PropTypes.number.isRequired,
  isLoading: PropTypes.bool.isRequired,
  onGrantPermission: PropTypes.func.isRequired,
  pendingPermissionId: PropTypes.string.isRequired,
  permissionCount: PropTypes.number.isRequired,
  status: PropTypes.shape({
    granted: PropTypes.bool,
    reason: PropTypes.string,
    status: PropTypes.string,
  }),
};

export default PermissionOnboardingSlide;
