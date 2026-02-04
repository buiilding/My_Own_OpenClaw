import { lazy, Suspense, useMemo, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import ChatInterface from '../features/chat/components/ChatInterface';
import MainLayout from '../components/MainLayout';
import { AppProvider } from './providers/AppProvider';
import { useAppConfigContext } from './providers/AppContextHooks';
import { ChatProvider } from './providers/ChatProvider';
import WakewordController from './WakewordController';
import '../styles/theme.css';
import '../styles/ChatInterface.css';
import '../styles/MainLayout.css';
import '../styles/accessibility.css';

const DashboardContent = lazy(() => import('../features/dashboard/components/DashboardContent'));

const SECTIONS = [
  { id: 'chat', label: 'Chat' },
  { id: 'episodic', label: 'Episodic Memory' },
  { id: 'semantic', label: 'Semantic Memory' },
  { id: 'procedural', label: 'Procedural Memory' },
  { id: 'models', label: 'Models' },
  { id: 'usage', label: 'Usage' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig } = useAppConfigContext();
  const [activeSection, setActiveSection] = useState('chat');

  const content = useMemo(() => {
    if (activeSection === 'chat') {
      return <ChatInterface />;
    }

    return (
      <Suspense fallback={<div className="settings-panel">Loading section...</div>}>
        <DashboardContent
          sectionId={activeSection}
          config={config}
          availableModels={availableModels}
          onConfigChange={updateConfig}
        />
      </Suspense>
    );
  }, [activeSection, config, availableModels, updateConfig]);

  return (
    <MainLayout
      sections={SECTIONS}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      content={content}
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
