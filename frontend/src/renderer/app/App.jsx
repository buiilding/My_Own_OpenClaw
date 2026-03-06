import { useCallback, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import ChatGptDashboardShell from '../features/dashboard/components/ChatGptDashboardShell';
import FrontendOnboardingSlideshow from '../features/onboarding/components/FrontendOnboardingSlideshow';
import {
  loadFrontendOnboardingState,
  saveFrontendOnboardingState,
} from '../features/onboarding/utils/frontendOnboardingStorage';
import { getAgentStopShortcutLabel } from '../infrastructure/shortcuts/agentStopShortcut';
import { isVmModeEnabled } from '../infrastructure/runtime/vmMode';
import { AppProvider } from './providers/AppProvider';
import { useAppConfigContext } from './providers/AppContextHooks';
import { ChatProvider } from './providers/ChatProvider';
import WakewordController from './WakewordController';
import '../styles/theme.css';
import '../styles/ChatInterface.css';
import '../styles/ChatGptDashboardShell.css';
import '../styles/CloneMemoryModels.css';
import '../styles/FrontendOnboarding.css';
import '../styles/accessibility.css';

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig } = useAppConfigContext();
  const vmModeEnabled = isVmModeEnabled();
  const [frontendOnboardingComplete, setFrontendOnboardingComplete] = useState(
    () => loadFrontendOnboardingState().completed,
  );

  const handleFrontendOnboardingComplete = useCallback(() => {
    const completionState = {
      completed: true,
      completed_at: new Date().toISOString(),
    };
    saveFrontendOnboardingState(completionState);
    setFrontendOnboardingComplete(true);
  }, []);

  if (vmModeEnabled) {
    return (
      <ChatGptDashboardShell
        config={config}
        availableModels={availableModels}
        onConfigChange={updateConfig}
        vmModeEnabled
      />
    );
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
      vmModeEnabled={false}
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
