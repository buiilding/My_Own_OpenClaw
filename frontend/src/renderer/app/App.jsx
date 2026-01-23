import { lazy, Suspense } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import ChatInterface from '../features/chat/components/ChatInterface';
import MainLayout from '../components/MainLayout';
import { AppProvider, useAppConfigContext, useAppStatusContext } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import '../styles/ChatInterface.css';
import '../styles/MainLayout.css';
import '../styles/accessibility.css';

// Lazy load SettingsPanel - not needed for initial render
const SettingsPanel = lazy(() => import('../features/settings/components/SettingsPanel'));

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  // Use split contexts for better performance
  // Components only re-render when their specific context changes
  const { config, availableModels, updateConfig } = useAppConfigContext();

  return (
    <MainLayout
      chat={<ChatInterface />}
      settings={
        <Suspense fallback={<div className="settings-loading">Loading settings...</div>}>
          <SettingsPanel
            config={config}
            availableModels={availableModels}
            onConfigChange={updateConfig}
          />
        </Suspense>
      }
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
