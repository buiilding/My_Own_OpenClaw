/**
 * Provides the desktop onboarding slideshow module for the renderer UI.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { DesktopShortcutRuntimeClient } from '../../../app/runtime/desktopShortcutRuntimeClient';
import { desktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import MainWindowControls from '../../../components/MainWindowControls';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import { usePermissionStore } from '../../permissions/stores/permissionStore';
import { useOnboardingPermissionActions } from '../hooks/useOnboardingPermissionActions';
import { buildOnboardingSlideState } from '../utils/onboardingSlides';
import PermissionOnboardingSlide from './PermissionOnboardingSlide';
import StopShortcutOnboardingSlide from './StopShortcutOnboardingSlide';

const onboardingSkin = desktopRuntimeSkin.onboarding;

function DesktopOnboardingSlideshow({
  onComplete,
  stopAgentShortcutLabel,
  allowWindowMaximize = true,
}) {
  const resolvedStopShortcutLabel = (
    stopAgentShortcutLabel || DesktopShortcutRuntimeClient.getAgentStopShortcutLabel()
  );
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const missingRequiredPermissions = usePermissionStore((state) => state.missingRequiredPermissions);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const completeOnboarding = usePermissionStore((state) => state.completeOnboarding);
  const {
    isLoading,
    pendingPermissionId,
    waitingPermissionId,
    handleGrantPermission,
  } = useOnboardingPermissionActions();
  const {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
  } = useMainWindowControls({ warningPrefix: 'DesktopOnboardingSlideshow' });
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const onboardingPermissions = Array.isArray(permissions)
    ? permissions.filter((permission) => permission?.show_in_onboarding !== false)
    : [];
  const {
    activePermission,
    activeSlideBody,
    activeSlideTitle,
    isLastSlide,
    isPermissionSlide,
    isStopFlowSlide,
    permissionSlides,
    totalSlides,
  } = buildOnboardingSlideState({ permissions: onboardingPermissions, activeSlideIndex });

  useEffect(() => {
    if (activeSlideIndex > totalSlides - 1) {
      setActiveSlideIndex(totalSlides - 1);
    }
  }, [activeSlideIndex, totalSlides]);
  const canStartProduct = bootstrapped && !isLoading;

  useEffect(() => {
    if (isPermissionSlide && !bootstrapped && !isLoading) {
      void bootstrapPermissions();
    }
  }, [bootstrapPermissions, bootstrapped, isLoading, isPermissionSlide]);

  function handleComplete() {
    const completed = completeOnboarding();
    if (completed && typeof onComplete === 'function') {
      onComplete();
    }
  }

  return (
    <div className="desktop-onboarding-shell">
      <div className="desktop-onboarding-window-chrome">
        <MainWindowControls
          className="desktop-onboarding-window-controls"
          onMinimize={handleWindowMinimize}
          onToggleMaximize={handleWindowToggleMaximize}
          onClose={handleWindowClose}
          showMaximize={allowWindowMaximize}
        />
      </div>
      <section
        className={[
          'desktop-onboarding-card',
          isPermissionSlide ? 'desktop-onboarding-card-permissions' : '',
        ].join(' ').trim()}
        aria-label={onboardingSkin.dialogLabel}
        role="dialog"
        aria-modal="true"
      >
        <div className="desktop-onboarding-card-scroll-region">
          <div className="desktop-onboarding-stage">
            <div className="desktop-onboarding-stage-copy">
              <p className="desktop-onboarding-progress">
                Step {activeSlideIndex + 1} of {totalSlides}
              </p>
              <h1 className="desktop-onboarding-title">{activeSlideTitle}</h1>
              <p className="desktop-onboarding-body">{activeSlideBody}</p>
            </div>
            {isPermissionSlide ? (
              <PermissionOnboardingSlide
                activePermission={activePermission}
                bootstrapped={bootstrapped}
                currentPermissionIndex={activeSlideIndex + 1}
                isLoading={isLoading}
                onGrantPermission={handleGrantPermission}
                pendingPermissionId={pendingPermissionId}
                waitingPermissionId={waitingPermissionId}
                permissionCount={permissionSlides.length}
                status={activePermission ? statusesByPermissionId[activePermission.permission_id] : null}
              />
            ) : isStopFlowSlide ? (
              <StopShortcutOnboardingSlide stopShortcutLabel={resolvedStopShortcutLabel} />
            ) : null}
            {isPermissionSlide && permissionSlides.length === 0 ? (
              <p className="desktop-onboarding-permission-error">
                {onboardingSkin.missingPermissionsMessage}
              </p>
            ) : null}
            {error ? (
              <p className="desktop-onboarding-permission-error">{error}</p>
            ) : null}
            {isLastSlide && !canStartProduct ? (
              <p className="desktop-onboarding-permission-error">
                {onboardingSkin.loadingPermissionsMessage}
              </p>
            ) : null}
            {isLastSlide && missingRequiredPermissions.length > 0 ? (
              <p className="desktop-onboarding-permission-error">
                {onboardingSkin.missingRequiredPermissionsMessage}
              </p>
            ) : null}
          </div>
        </div>
        <div className="desktop-onboarding-actions">
          {activeSlideIndex > 0 ? (
            <button
              type="button"
              className="desktop-onboarding-button secondary"
              onClick={() => setActiveSlideIndex((current) => Math.max(current - 1, 0))}
            >
              Back
            </button>
          ) : (
            <span aria-hidden="true" className="desktop-onboarding-action-spacer" />
          )}
          {isLastSlide ? (
            <button
              type="button"
              className="desktop-onboarding-button primary"
              onClick={handleComplete}
              disabled={!canStartProduct}
            >
              {onboardingSkin.startLabel}
            </button>
          ) : (
            <button
              type="button"
              className="desktop-onboarding-button primary"
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

DesktopOnboardingSlideshow.propTypes = {
  allowWindowMaximize: PropTypes.bool,
  onComplete: PropTypes.func,
  stopAgentShortcutLabel: PropTypes.string,
};

export default DesktopOnboardingSlideshow;
