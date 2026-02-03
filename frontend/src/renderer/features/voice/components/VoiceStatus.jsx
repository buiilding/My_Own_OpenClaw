import PropTypes from 'prop-types';
import '../../../styles/VoiceStatus.css';

function VoiceStatus({ error, isRecording, isConnected }) {
  if (error) {
    return (
      <div className="voice-status voice-status--error">
        ⚠️ Voice Mode Error: {error}
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="voice-status voice-status--active">
        <span className="voice-status-icon">🎤</span>
        <span>Voice mode active - {isConnected ? 'Listening...' : 'Connecting...'}</span>
      </div>
    );
  }
  
  return null;
}

VoiceStatus.propTypes = {
  error: PropTypes.string,
  isRecording: PropTypes.bool,
  isConnected: PropTypes.bool,
};

export default VoiceStatus;
