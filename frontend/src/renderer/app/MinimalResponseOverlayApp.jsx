import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import MinimalResponseOverlay from '../features/minimalChatPill/MinimalResponseOverlay';
import '../styles/theme.css';
import '../styles/MinimalChatPill.css';
import '../styles/accessibility.css';

export default function MinimalResponseOverlayApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MinimalResponseOverlay />
      </AppProvider>
    </ErrorBoundary>
  );
}
