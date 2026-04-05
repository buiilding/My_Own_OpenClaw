import PropTypes from 'prop-types';
import '../../../styles/VoiceStatus.css';

function VoiceStatus({ error, isRecording, isConnected, isActive }) {
  if (error) {
    return (
      <div className="voice-status voice-status--error">
        ⚠️ Voice Mode Error: {error}
      </div>
    );
  }

  if (isActive) {
    const statusLabel = isRecording && isConnected ? 'Listening...' : 'Connecting...';
    return (
      <div className="voice-status voice-status--active">
        <span className="voice-status-icon">🎤</span>
        <span>Voice mode active - {statusLabel}</span>
      </div>
    );
  }
  
  return null;
}

VoiceStatus.propTypes = {
  error: PropTypes.string,
  isActive: PropTypes.bool,
  isRecording: PropTypes.bool,
  isConnected: PropTypes.bool,
};

export default VoiceStatus;
