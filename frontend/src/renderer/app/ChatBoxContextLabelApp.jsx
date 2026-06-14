/**
 * Provides the chat box context label app module for the renderer UI.
 */

import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import ChatBoxContextLabel from '../features/chat/components/ChatBoxContextLabel';
import '../styles/theme.css';
import '../styles/ChatBox.css';
import '../styles/accessibility.css';

function ChatBoxContextLabelApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ChatProvider enableTranscript={false}>
          <ChatBoxContextLabel />
        </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default ChatBoxContextLabelApp;
