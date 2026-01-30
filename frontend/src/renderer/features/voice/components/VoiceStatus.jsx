import PropTypes from 'prop-types';

function VoiceStatus({ error, isRecording, isConnected }) {
  if (error) {
    return (
      <div className="voice-mode-error" style={{
        backgroundColor: '#fee2e2',
        border: '1px solid #fca5a5',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '8px',
        color: '#991b1b',
        fontSize: '14px'
      }}>
        ⚠️ Voice Mode Error: {error}
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="voice-mode-indicator" style={{
        backgroundColor: '#dbeafe',
        border: '1px solid #93c5fd',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '8px',
        color: '#1e40af',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontSize: '16px' }}>🎤</span>
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
