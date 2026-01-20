import { useChatContext } from '../context/ChatContext';
import '../styles/ModeIndicator.css';

function ModeIndicator() {
  const { mode } = useChatContext();
  
  return (
    <div className="mode-indicator-container">
      <div className={`mode-badge ${mode === 'agent' ? 'mode-agent' : 'mode-chat'}`}>
        <span className="mode-icon">{mode === 'agent' ? '🤖' : '💬'}</span>
        <span className="mode-text">{mode === 'agent' ? 'AGENT MODE' : 'CHAT MODE'}</span>
        <span className="mode-hint">(Shift+Tab to toggle)</span>
      </div>
    </div>
  );
}

export default ModeIndicator;
