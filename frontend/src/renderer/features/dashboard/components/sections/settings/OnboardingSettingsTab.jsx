import { useCallback } from 'react';
import { usePermissionStore } from '../../../../permissions/stores/permissionStore';

function OnboardingSettingsTab() {
  const restartOnboarding = usePermissionStore((state) => state.restartOnboarding);

  const handleRestartOnboarding = useCallback(() => {
    restartOnboarding();
  }, [restartOnboarding]);

  return (
    <div className="clone-settings-general">
      <h2>Onboarding</h2>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>Run onboarding again</span>
          <p>
            Return to the first-run permission and setup flow. Use this if you want to review
            required permissions or repeat the onboarding walkthrough.
          </p>
        </div>
        <button
          type="button"
          className="clone-settings-secondary-button"
          onClick={handleRestartOnboarding}
        >
          Open onboarding
        </button>
      </div>
    </div>
  );
}

export default OnboardingSettingsTab;
