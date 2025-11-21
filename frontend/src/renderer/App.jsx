import { useState, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OverlayLayout from './components/OverlayLayout';
import { useMessageHandling } from './hooks/useMessageHandling';
import { useInitialConfig } from './hooks/useInitialConfig';
import './styles/OverlayLayout.css';
import './styles/ThinkingDisplay.css';

/**
 * The root component of the application.
 * It sets up the main layout, manages the application's primary state
 * (like chat messages and config), and handles communication with the backend.
 */
function App() {
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const configBeforeSave = useRef(null);
  const saveTimeoutId = useRef(null);

  // Handle backend messages and config updates
  useMessageHandling(
    setMessages,
    setIsSending,
    setThinkingStatus,
    setConfig,
    setAvailableModels,
    setSaveStatus,
    configBeforeSave,
    saveTimeoutId
  );

  // Initialize app configuration
  useInitialConfig();

  const handleSendMessage = (text) => {
    // Add user's message to the chat
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: crypto.randomUUID(), text, sender: 'user' },
    ]);
    setIsSending(true);
    setThinkingStatus(null); // Reset thinking status for new query

    // Send the message to the backend
    window.ipc.send('to-backend', {
      type: 'query',
      payload: { text },
    });
  };

  // Config change handler is kept but not used in OverlayLayout for now
  const handleConfigChange = (updatedConfig) => {
    // Prevent concurrent saves
    if (saveStatus === 'saving') {
      return;
    }

    // Store the original config in case we need to revert
    configBeforeSave.current = config;

    // Optimistically update the state and set status to saving
    setConfig(updatedConfig);
    setSaveStatus('saving');

    // Fallback timeout in case backend never responds
    saveTimeoutId.current = setTimeout(() => {
      setSaveStatus('error');
      if (configBeforeSave.current) {
        setConfig(configBeforeSave.current);
        configBeforeSave.current = null;
      }
    }, 10000); // 10 second timeout

    window.ipc.send('to-backend', {
      type: 'update-settings',
      payload: updatedConfig,
    });
  };

  return (
    <ErrorBoundary>
      <OverlayLayout
        messages={messages}
        onSendMessage={handleSendMessage}
        isSending={isSending}
        thinkingStatus={thinkingStatus}
        config={config}
        availableModels={availableModels}
        onConfigChange={handleConfigChange}
      />
    </ErrorBoundary>
  );
}

export default App;
