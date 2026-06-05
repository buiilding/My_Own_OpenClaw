import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import MinimalChatPill from '../features/minimalChatPill/components/MinimalChatPill';
import '../styles/theme.css';
import '../styles/ChatBox.css';
import '../styles/accessibility.css';

function MinimalChatPillApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
      <ChatProvider enableTranscript={false}>
        <MinimalChatPill />
      </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default MinimalChatPillApp;
