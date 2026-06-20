/**
 * Defines onboarding settings tab configuration for the renderer UI.
 */

import { useCallback } from 'react';
import { usePermissionStore } from '../../../../permissions/stores/permissionStore';

function OnboardingSettingsTab() {
  const restartOnboarding = usePermissionStore((state) => state.restartOnboarding);

  const handleRestartOnboarding = useCallback(() => {
    restartOnboarding();
  }, [restartOnboarding]);

  return (
    <div className="settings-surface-general">
      <h2>Onboarding</h2>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-action">
        <div>
          <span>Run onboarding again</span>
          <p>
            Return to the first-run permission and setup flow. Use this if you want to review
            required permissions or repeat the onboarding walkthrough.
          </p>
        </div>
        <button
          type="button"
          className="settings-surface-secondary-button"
          onClick={handleRestartOnboarding}
        >
          Open onboarding
        </button>
      </div>
    </div>
  );
}

export default OnboardingSettingsTab;
