import ErrorBoundary from '../components/ErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import MinimalChatPill from '../features/minimalChatPill/MinimalChatPill';
import '../styles/theme.css';
import '../styles/MinimalChatPill.css';
import '../styles/accessibility.css';

export default function MinimalChatPillApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MinimalChatPill />
      </AppProvider>
    </ErrorBoundary>
  );
}
