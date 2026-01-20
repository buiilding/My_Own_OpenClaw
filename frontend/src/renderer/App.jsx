import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import MainLayout from './components/MainLayout';
import SettingsPanel from './components/SettingsPanel';
import CompactOverlay from './components/CompactOverlay';
import { AppProvider, useAppContext } from './context/AppContext';
import { ChatProvider, useChatContext } from './context/ChatContext';
import './styles/ChatInterface.css';
import './styles/MainLayout.css';
import './styles/accessibility.css';

/**
 * Content wrapper that has access to AppContext
 */
function AppContent() {
  const { config, availableModels, updateConfig, saveStatus } = useAppContext();
  const { mode, isAgentActive, toolCallsForOverlay, thinkingStatus } = useChatContext();

  // Debug logging
  console.log('[AppContent] Mode:', mode, 'isAgentActive:', isAgentActive, 'toolCalls:', toolCallsForOverlay.length);

  // Show compact overlay in agent mode when active
  if (mode === 'agent' && isAgentActive) {
    console.log('[AppContent] Rendering CompactOverlay');
    return (
      <CompactOverlay 
        toolCalls={toolCallsForOverlay} 
        thinkingStatus={thinkingStatus} 
      />
    );
  }

  // Normal chat UI
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
