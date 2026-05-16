import { useEffect, useRef } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import DashboardShell from '../features/dashboard/components/DashboardShell';
import FrontendOnboardingSlideshow from '../features/onboarding/components/FrontendOnboardingSlideshow';
import { usePermissionStore } from '../features/permissions/stores/permissionStore';
import { getGlobalAgentStopShortcutLabel } from '../infrastructure/shortcuts/agentStopShortcut';
import { IpcBridge, INVOKE_CHANNELS } from '../infrastructure/ipc/bridge';
import { isVmModeEnabled } from '../infrastructure/runtime/vmMode';
import { selectStartupSurface } from './startupSurface';
import { AppProvider } from './providers/AppProvider';
import { useAppConfigContext } from './providers/AppContextHooks';
import { ChatProvider } from './providers/ChatProvider';
import WakewordController from './WakewordController';
import '../styles/theme.css';
import '../styles/ChatInterface.css';
import '../styles/DashboardShell.css';
import '../styles/CloneMemoryModels.css';
import '../styles/FrontendOnboarding.css';
import '../styles/accessibility.css';

function DashboardStartupSurface({
  config,
  availableModels,
  onConfigChange,
  vmModeEnabled,
}) {
  return (
    <>
      <WakewordController />
      <DashboardShell
        config={config}
        availableModels={availableModels}
        onConfigChange={onConfigChange}
        vmModeEnabled={vmModeEnabled}
      />
    </>
  );
}

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig } = useAppConfigContext();
  const vmModeEnabled = isVmModeEnabled();
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const needsOnboarding = usePermissionStore((state) => state.needsOnboarding);
  const onboardingCompleted = usePermissionStore((state) => state.onboardingState?.completed === true);
  const lastAppliedStartupSurfaceRef = useRef(null);
  const startupSurface = selectStartupSurface({
    vmModeEnabled,
    bootstrapped,
    needsOnboarding,
    onboardingCompleted,
  });

  useEffect(() => {
    if (lastAppliedStartupSurfaceRef.current === startupSurface) {
      return;
    }
    lastAppliedStartupSurfaceRef.current = startupSurface;

    async function applyStartupSurface() {
      try {
        if (startupSurface === 'dashboard-vm') {
          await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, { focus: true });
          return;
        }

        if (startupSurface === 'onboarding') {
          await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, {
            focus: true,
            open: 'onboarding',
          });
          return;
        }

        await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: true });
      } catch (error) {
        console.warn('[App] Failed to apply startup surface:', error);
      }
    }

    void applyStartupSurface();
  }, [startupSurface]);

  if (startupSurface === 'dashboard-vm') {
    return (
      <DashboardStartupSurface
        config={config}
        availableModels={availableModels}
        onConfigChange={updateConfig}
        vmModeEnabled
      />
    );
  }

  if (startupSurface === 'onboarding') {
    return (
      <FrontendOnboardingSlideshow
        allowWindowMaximize={false}
        stopAgentShortcutLabel={getGlobalAgentStopShortcutLabel(config?.global_agent_stop_shortcut)}
      />
    );
  }

  return (
    <DashboardStartupSurface
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
          <AppContent />
        </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
