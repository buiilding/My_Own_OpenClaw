import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import ChatBoxResponse from '../features/chat/components/ChatBoxResponse';
import '../styles/theme.css';
import '../styles/ChatBox.css';
import '../styles/ChatBoxResponseOverlay.css';
import '../styles/accessibility.css';

function ChatBoxResponseApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
      <ChatProvider enableTranscript={false}>
        <ChatBoxResponse />
      </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default ChatBoxResponseApp;
