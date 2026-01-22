import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import MainLayout from './components/MainLayout';
import SettingsPanel from './components/SettingsPanel';
import { AppProvider, useAppContext } from './context/AppContext';
import { ChatProvider } from './context/ChatContext';
import './styles/ChatInterface.css';
import './styles/MainLayout.css';
import './styles/accessibility.css';

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig, saveStatus } = useAppContext();

  return (
    <MainLayout
      chat={<ChatInterface />}
      settings={
        <SettingsPanel
          config={config}
          availableModels={availableModels}
          onConfigChange={updateConfig}
          saveStatus={saveStatus}
        />
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
