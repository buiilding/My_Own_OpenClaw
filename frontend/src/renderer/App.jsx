import { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import MainLayout from './components/MainLayout';
import './styles/ChatInterface.css';
import './styles/MainLayout.css';
import './styles/accessibility.css';

/**
 * The root component of the application.
 * It sets up the main layout, manages the application's primary state
 * (like chat messages), and handles communication with the backend IPC bridge.
 */
function App() {
  const [messages, setMessages] = useState([
    { text: 'Hello! How can I help you today?', sender: 'assistant' },
  ]);
  const [isSending, setIsSending] = useState(false);

  // Listen for messages from the backend
  useEffect(() => {
    const removeBackendListener = window.ipc.on('from-backend', (data) => {
      if (data.type === 'pong' || data.type === 'response') {
        const newMesage = {
          text: data.payload.text || JSON.stringify(data.payload),
          sender: 'assistant',
        };
        setMessages((prevMessages) => [...prevMessages, newMesage]);
        setIsSending(false);
      }
    });

    return () => {
      removeBackendListener();
    };
  }, []);

  const handleSendMessage = (text) => {
    // Add user's message to the chat
    setMessages((prevMessages) => [...prevMessages, { text, sender: 'user' }]);
    setIsSending(true);

    // Send the message to the backend
    window.ipc.send('to-backend', {
      type: 'query',
      payload: { text },
    });
  };

  return (
    <ErrorBoundary>
      <MainLayout>
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isSending={isSending}
        />
      </MainLayout>
    </ErrorBoundary>
  );
}

export default App;
