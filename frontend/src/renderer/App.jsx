import { useState, useRef, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import MainLayout from './components/MainLayout';
import SettingsPanel from './components/SettingsPanel';
import { useMessageHandling } from './hooks/useMessageHandling';
import { useInitialConfig } from './hooks/useInitialConfig';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import './styles/ChatInterface.css';
import './styles/MainLayout.css';
import './styles/accessibility.css';

// TODO: Refactor state management.
// The current approach of passing down state setters ("prop drilling") is not ideal.
// A centralized state management solution like Zustand or Redux Toolkit would be more
// scalable and would simplify the component hierarchy. This is a medium-priority refactor.

/**
 * The root component of the application.
 * It sets up the main layout, manages the application's primary state
 * (like chat messages and config), and handles communication with the backend.
 */
function App() {
  const [messages, setMessages] = useState([
    {
      id: crypto.randomUUID(),
      text: 'Hello! How can I help you today?',
      sender: 'assistant',
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const configBeforeSave = useRef(null);
  const saveTimeoutId = useRef(null);

  // Initialize audio player
  const { enqueueAudio, stopPlayback } = useAudioPlayer();

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

  // Listen for audio chunks from backend
  useEffect(() => {
    const handleAudioChunk = (event, data) => {
      if (data.type === 'audio-chunk') {
        enqueueAudio(data.payload);
      }
    };

    // Listen for IPC messages for audio chunks
    // Note: useMessageHandling handles most messages, but we can add a specific listener here
    // or modify useMessageHandling to accept an audio handler.
    // For simplicity and separation of concerns, we'll attach a listener here,
    // but we need to make sure we don't double-process messages if useMessageHandling consumes them.
    // Actually, useMessageHandling uses a specific set of handlers.
    // Let's check if we can piggyback on window.ipc
    
    const removeListener = window.ipc.on('from-backend', (data) => {
      if (data.type === 'audio-chunk') {
        enqueueAudio(data.payload);
      }
    });

    return () => {
      removeListener();
      stopPlayback(); // Stop playback when unmounting
    };
  }, [enqueueAudio, stopPlayback]);

  const handleSendMessage = (text) => {
    // Stop any current audio playback when user sends a new message
    stopPlayback();
    
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
      <MainLayout
        chat={
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isSending={isSending}
            thinkingStatus={thinkingStatus}
            voiceModeEnabled={config?.voice_mode_enabled || false}
          />
        }
        settings={
          <SettingsPanel
            config={config}
            availableModels={availableModels}
            onConfigChange={handleConfigChange}
            saveStatus={saveStatus}
          />
        }
      />
    </ErrorBoundary>
  );
}

export default App;
