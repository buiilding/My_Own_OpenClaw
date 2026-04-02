import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import ChatBox from '../features/chat/components/ChatBox';
import '../styles/theme.css';
import '../styles/ChatComposer.css';
import '../styles/ChatBox.css';
import '../styles/accessibility.css';

function ChatBoxApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ChatProvider enableToolRunner={false} enableTranscript={false}>
          <ChatBox />
        </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default ChatBoxApp;
