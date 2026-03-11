import ErrorBoundary from '../components/ErrorBoundary';
import ChatGptDashboardShell from '../features/dashboard/components/ChatGptDashboardShell';
import FrontendOnboardingSlideshow from '../features/onboarding/components/FrontendOnboardingSlideshow';
import { usePermissionStore } from '../features/permissions/stores/permissionStore';
import { getGlobalAgentStopShortcutLabel } from '../infrastructure/shortcuts/agentStopShortcut';
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
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const needsOnboarding = usePermissionStore((state) => state.needsOnboarding);
  const onboardingCompleted = usePermissionStore((state) => state.onboardingState?.completed === true);
  const shouldShowOnboarding = bootstrapped ? needsOnboarding : !onboardingCompleted;

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

  if (shouldShowOnboarding) {
    return (
      <FrontendOnboardingSlideshow
        stopAgentShortcutLabel={getGlobalAgentStopShortcutLabel(config?.global_agent_stop_shortcut)}
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
