/**
 * Provides the minimal response overlay app module for the renderer UI.
 */

import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { ChatProvider } from './providers/ChatProvider';
import MinimalResponseOverlay from '../features/minimalChatPill/components/MinimalResponseOverlay';
import '../styles/theme.css';
import '../styles/ChatInterface.css';
import '../styles/ChatBox.css';
import '../styles/ChatBoxResponseOverlay.css';
import '../styles/accessibility.css';

function MinimalResponseOverlayApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
      <ChatProvider enableTranscript={false}>
        <MinimalResponseOverlay />
      </ChatProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default MinimalResponseOverlayApp;
