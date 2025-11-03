import { useState, useEffect, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import MainLayout from './components/MainLayout';
import SettingsPanel from './components/SettingsPanel';
import './styles/ChatInterface.css';
import './styles/MainLayout.css';
import './styles/accessibility.css';

/**
 * The root component of the application.
 * It sets up the main layout, manages the application's primary state
 * (like chat messages and config), and handles communication with the backend.
 */
function App() {
  const [messages, setMessages] = useState([
    { text: 'Hello! How can I help you today?', sender: 'assistant' },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const configBeforeSave = useRef(null);
  const saveTimeoutId = useRef(null);

  // Listen for messages and config updates from the backend
  useEffect(() => {
    const removeBackendListener = window.ipc.on('from-backend', (data) => {
      if (data.type === 'pong' || data.type === 'response') {
        const newMesage = {
          text: data.payload.text || JSON.stringify(data.payload),
          sender: 'assistant',
        };
        setMessages((prevMessages) => [...prevMessages, newMesage]);
        setIsSending(false);
      } else if (data.type === 'llm-thought') {
        setThinkingStatus((prevStatus) => {
          const updated = (prevStatus || '') + data.payload.status;
          return updated.length > 1000 ? updated.slice(-1000) : updated;
        });
      } else if (data.type === 'streaming-response') {
        setIsSending(false); // We've got the first chunk, so we're not "sending" anymore
        setThinkingStatus(null); // Hide thinking status when response starts
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
            // Append chunk to the last message by creating a new object
            return [
              ...prevMessages.slice(0, -1),
              { ...lastMessage, text: lastMessage.text + data.payload.text },
            ];
          } else {
            // This is the first chunk, create a new message object
            return [
              ...prevMessages,
              { text: data.payload.text, sender: 'assistant', isComplete: false },
            ];
          }
        });
      } else if (data.type === 'streaming-complete') {
        setThinkingStatus(null);
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage && lastMessage.sender === 'assistant') {
            return [
              ...prevMessages.slice(0, -1),
              { ...lastMessage, isComplete: true },
            ];
          }
          return prevMessages;
        });
      } else if (data.type === 'settings-loaded') {
        setConfig(data.payload);
        // Request available models when settings are loaded
        window.ipc.send('to-backend', { type: 'list-models' });
      } else if (data.type === 'models-listed') {
        setAvailableModels(data.payload);
      } else if (data.type === 'settings-saved') {
        clearTimeout(saveTimeoutId.current);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else if (
        data.type === 'error' &&
        data.payload.message?.includes('Failed to save settings')
      ) {
        clearTimeout(saveTimeoutId.current);
        setSaveStatus('error');
        // Revert to the old config on failure
        if (configBeforeSave.current) {
          setConfig(configBeforeSave.current);
          configBeforeSave.current = null;
        }
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    });

    // Request the initial config from the backend
    window.ipc.send('to-backend', { type: 'load-settings' });

    return () => {
      removeBackendListener();
      clearTimeout(saveTimeoutId.current); // Cleanup on unmount
    };
  }, []);

  const handleSendMessage = (text) => {
    // Add user's message to the chat
    setMessages((prevMessages) => [...prevMessages, { text, sender: 'user' }]);
    setIsSending(true);
    setThinkingStatus(null); // Reset thinking status for new query

    // Send the message to the backend
    window.ipc.send('to-backend', {
      type: 'query',
      payload: { text },
    });
  };

  const handleSaveSettings = (updatedConfig) => {
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
      type: 'save-settings',
      payload: updatedConfig,
    });
  };

  return (
    <ErrorBoundary>
      <MainLayout
        chat={
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isSending={isSending}
            thinkingStatus={thinkingStatus}
          />
        }
        settings={
          <SettingsPanel
            config={config}
            availableModels={availableModels}
            onSave={handleSaveSettings}
            saveStatus={saveStatus}
          />
        }
      />
    </ErrorBoundary>
  );
}

export default App;
