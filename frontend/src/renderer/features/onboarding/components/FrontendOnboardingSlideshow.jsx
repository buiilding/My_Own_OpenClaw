import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import MainWindowControls from '../../../components/MainWindowControls';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import { getAgentStopShortcutLabel } from '../../../infrastructure/shortcuts/agentStopShortcut';
import { usePermissionStore } from '../../permissions/stores/permissionStore';
import { useOnboardingPermissionActions } from '../hooks/useOnboardingPermissionActions';
import { buildOnboardingSlideState } from '../utils/onboardingSlides';
import PermissionOnboardingSlide from './PermissionOnboardingSlide';
import StopShortcutOnboardingSlide from './StopShortcutOnboardingSlide';

function FrontendOnboardingSlideshow({ onComplete, stopAgentShortcutLabel }) {
  const resolvedStopShortcutLabel = stopAgentShortcutLabel || getAgentStopShortcutLabel();
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const missingRequiredPermissions = usePermissionStore((state) => state.missingRequiredPermissions);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const completeOnboarding = usePermissionStore((state) => state.completeOnboarding);
  const { isLoading, pendingPermissionId, handleGrantPermission } = useOnboardingPermissionActions();
  const startupMaximizeRequestedRef = useRef(false);
  const {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
    showMainWindow,
  } = useMainWindowControls({ warningPrefix: 'FrontendOnboardingSlideshow' });
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const {
    activePermission,
    activeSlideBody,
    activeSlideTitle,
    isLastSlide,
    isPermissionSlide,
    isStopFlowSlide,
    permissionSlideCount,
    permissionSlides,
    totalSlides,
  } = buildOnboardingSlideState({ permissions, activeSlideIndex });

  useEffect(() => {
    if (activeSlideIndex > totalSlides - 1) {
      setActiveSlideIndex(totalSlides - 1);
    }
  }, [activeSlideIndex, totalSlides]);
  const canStartWindieOs = bootstrapped && !isLoading;

  useEffect(() => {
    if (isPermissionSlide && !bootstrapped && !isLoading) {
      void bootstrapPermissions();
    }
  }, [bootstrapPermissions, bootstrapped, isLoading, isPermissionSlide]);

  useEffect(() => {
    if (startupMaximizeRequestedRef.current) {
      return;
    }
    startupMaximizeRequestedRef.current = true;
    void showMainWindow({ focus: true, maximize: true });
  }, [showMainWindow]);

  function handleComplete() {
    const completed = completeOnboarding();
    if (completed && typeof onComplete === 'function') {
      onComplete();
    }
  }

  return (
    <div className="frontend-onboarding-shell">
      <div className="frontend-onboarding-window-chrome">
        <MainWindowControls
          className="frontend-onboarding-window-controls"
          onMinimize={handleWindowMinimize}
          onToggleMaximize={handleWindowToggleMaximize}
          onClose={handleWindowClose}
        />
      </div>
      <section
        className={[
          'frontend-onboarding-card',
          isPermissionSlide ? 'frontend-onboarding-card-permissions' : '',
        ].join(' ').trim()}
        aria-label="WindieOS onboarding"
        role="dialog"
        aria-modal="true"
      >
        <div className="frontend-onboarding-card-scroll-region">
          <div className="frontend-onboarding-stage">
            <div className="frontend-onboarding-stage-copy">
              <p className="frontend-onboarding-progress">
                Step {activeSlideIndex + 1} of {totalSlides}
              </p>
              <h1 className="frontend-onboarding-title">{activeSlideTitle}</h1>
              <p className="frontend-onboarding-body">{activeSlideBody}</p>
            </div>
            {isPermissionSlide ? (
              <PermissionOnboardingSlide
                activePermission={activePermission}
                bootstrapped={bootstrapped}
                currentPermissionIndex={activeSlideIndex + 1}
                isLoading={isLoading}
                onGrantPermission={handleGrantPermission}
                pendingPermissionId={pendingPermissionId}
                permissionCount={permissionSlides.length}
                status={activePermission ? statusesByPermissionId[activePermission.permission_id] : null}
              />
            ) : isStopFlowSlide ? (
              <StopShortcutOnboardingSlide stopShortcutLabel={resolvedStopShortcutLabel} />
            ) : null}
            {isPermissionSlide && permissionSlides.length === 0 ? (
              <p className="frontend-onboarding-permission-error">
                WindieOS could not find any onboarding permissions for this platform.
              </p>
            ) : null}
            {error ? (
              <p className="frontend-onboarding-permission-error">{error}</p>
            ) : null}
            {isLastSlide && !canStartWindieOs ? (
              <p className="frontend-onboarding-permission-error">
                WindieOS is still loading permission status. Wait a moment and try again.
              </p>
            ) : null}
            {isLastSlide && missingRequiredPermissions.length > 0 ? (
              <p className="frontend-onboarding-permission-error">
                Some permissions are still missing. You can continue now and grant them later in Settings.
              </p>
            ) : null}
          </div>
        </div>
        <div className="frontend-onboarding-actions">
          {activeSlideIndex > 0 ? (
            <button
              type="button"
              className="frontend-onboarding-button secondary"
              onClick={() => setActiveSlideIndex((current) => Math.max(current - 1, 0))}
            >
              Back
            </button>
          ) : (
            <span aria-hidden="true" className="frontend-onboarding-action-spacer" />
          )}
          {isLastSlide ? (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={handleComplete}
              disabled={!canStartWindieOs}
            >
              Start WindieOS
            </button>
          ) : (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={() => setActiveSlideIndex((current) => Math.min(current + 1, totalSlides - 1))}
            >
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

FrontendOnboardingSlideshow.propTypes = {
  onComplete: PropTypes.func,
  stopAgentShortcutLabel: PropTypes.string,
};

export default FrontendOnboardingSlideshow;
