import { useCallback, useEffect, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import ChatGptDashboardShell from '../features/dashboard/components/ChatGptDashboardShell';
import FrontendOnboardingSlideshow from '../features/onboarding/components/FrontendOnboardingSlideshow';
import {
  loadFrontendOnboardingState,
  saveFrontendOnboardingState,
} from '../features/onboarding/utils/frontendOnboardingStorage';
import { getAgentStopShortcutLabel } from '../infrastructure/shortcuts/agentStopShortcut';
import PermissionOnboardingWizard from '../features/permissions/components/PermissionOnboardingWizard';
import { usePermissionStore } from '../features/permissions/stores/permissionStore';
import { AppProvider } from './providers/AppProvider';
import { useAppConfigContext } from './providers/AppContextHooks';
import { ChatProvider } from './providers/ChatProvider';
import WakewordController from './WakewordController';
import '../styles/theme.css';
import '../styles/ChatInterface.css';
import '../styles/ChatGptDashboardShell.css';
import '../styles/CloneMemoryModels.css';
import '../styles/FrontendOnboarding.css';
import '../styles/PermissionOnboarding.css';
import '../styles/accessibility.css';

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig } = useAppConfigContext();
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const isLoading = usePermissionStore((state) => state.isLoading);
  const needsOnboarding = usePermissionStore((state) => state.needsOnboarding);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const [frontendOnboardingComplete, setFrontendOnboardingComplete] = useState(
    () => loadFrontendOnboardingState().completed,
  );

  useEffect(() => {
    if (!bootstrapped && !isLoading) {
      void bootstrapPermissions();
    }
  }, [bootstrapped, isLoading, bootstrapPermissions]);

  const handleFrontendOnboardingComplete = useCallback(() => {
    const completionState = {
      completed: true,
      completed_at: new Date().toISOString(),
    };
    saveFrontendOnboardingState(completionState);
    setFrontendOnboardingComplete(true);
  }, []);

  if (!bootstrapped || isLoading) {
    return (
      <div className="permission-onboarding-shell">
        <section className="permission-onboarding-card">
          <h2>Loading permission profile...</h2>
          <p>Checking install-time permission state.</p>
        </section>
      </div>
    );
  }

  if (needsOnboarding) {
    return <PermissionOnboardingWizard />;
  }

  if (!frontendOnboardingComplete) {
    return (
      <FrontendOnboardingSlideshow
        stopAgentShortcutLabel={getAgentStopShortcutLabel()}
        onComplete={handleFrontendOnboardingComplete}
      />
    );
  }

  return (
    <ChatGptDashboardShell
      config={config}
      availableModels={availableModels}
      onConfigChange={updateConfig}
    />
  );
}

/**
 * The root component of the application.
 * Sets up the global context providers and layout.
 */
function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ChatProvider>
          <WakewordController />
          <AppContent />
        </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
