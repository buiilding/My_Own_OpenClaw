/**
 * Provides the permission onboarding slide module for the renderer UI.
 */

import PropTypes from 'prop-types';
import {
  getPermissionActionLabel,
  getPermissionGrantedLabel,
  getPermissionKindLabel,
  isPermissionGrantedStatus,
} from '../../../app/runtime/desktopPermissionPresentationRuntime';

function PermissionOnboardingSlide({
  activePermission = null,
  bootstrapped,
  currentPermissionIndex,
  isLoading,
  pendingPermissionId,
  permissionCount,
  status = null,
  waitingPermissionId,
  onGrantPermission,
}) {
  if (!activePermission) {
    return (
      <div className="desktop-onboarding-permissions-section">
        <p className="desktop-onboarding-permission-empty">
          {bootstrapped ? 'No permission items were returned by the manifest.' : 'Loading permissions...'}
        </p>
      </div>
    );
  }

  const statusReason = typeof status?.reason === 'string' ? status.reason.trim() : '';
  const isGranted = isPermissionGrantedStatus(status);
  const isPending = pendingPermissionId === activePermission.permission_id;
  const isWaiting = waitingPermissionId === activePermission.permission_id;
  const actionLabel = getPermissionActionLabel(activePermission);
  const grantedLabel = getPermissionGrantedLabel(activePermission);

  return (
    <div className="desktop-onboarding-permissions-section">
      <div className="desktop-onboarding-permission-stage-meta">
        <p className="desktop-onboarding-permission-stage-count">
          Permission {currentPermissionIndex} of {permissionCount}
        </p>
        <p className="desktop-onboarding-permission-stage-summary">
          Grant what you want now. You can revisit the rest later in Settings.
        </p>
      </div>
      <div className="desktop-onboarding-permissions-list single">
        <article className="desktop-onboarding-permission-row single">
          <div className="desktop-onboarding-permission-copy">
            <h2>{activePermission.label}</h2>
            <p className="desktop-onboarding-permission-kind">
              {getPermissionKindLabel(activePermission)}
            </p>
            <p>{activePermission.description}</p>
            {statusReason ? (
              <p className={`desktop-onboarding-permission-reason status-${status?.status || 'unknown'}`}>
                {statusReason}
              </p>
            ) : null}
          </div>
          {isGranted ? (
            <div className="desktop-onboarding-permission-granted" aria-label={grantedLabel}>
              <span className="desktop-onboarding-permission-granted-icon" aria-hidden="true">✓</span>
              <span>{grantedLabel}</span>
            </div>
          ) : (
            <button
              type="button"
              className="desktop-onboarding-button primary"
              onClick={() => {
                void onGrantPermission(activePermission.permission_id);
              }}
              disabled={isLoading || isPending || isWaiting}
            >
              {isPending ? `${actionLabel}...` : isWaiting ? 'Waiting...' : actionLabel}
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
  waitingPermissionId: PropTypes.string.isRequired,
};

export default PermissionOnboardingSlide;
