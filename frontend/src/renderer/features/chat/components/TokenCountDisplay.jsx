import PropTypes from 'prop-types';
import '../../../styles/TokenCountDisplay.css';

function TokenCountDisplay({ tokenCounts }) {
  if (!tokenCounts) {
    return null;
  }

  const { input_tokens, output_tokens, total_tokens, conversation_tokens } = tokenCounts;

  return (
    <div className="token-count-display">
      <div className="token-count-item">
        <span className="token-label">Input:</span>
        <span className="token-value">{input_tokens?.toLocaleString() || 0}</span>
      </div>
      <div className="token-count-item">
        <span className="token-label">Output:</span>
        <span className="token-value">{output_tokens?.toLocaleString() || 0}</span>
      </div>
      <div className="token-count-item">
        <span className="token-label">Total:</span>
        <span className="token-value">{total_tokens?.toLocaleString() || 0}</span>
      </div>
      <div className="token-count-item conversation-total">
        <span className="token-label">Conversation:</span>
        <span className="token-value">{conversation_tokens?.toLocaleString() || 0}</span>
      </div>
    </div>
  );
}

TokenCountDisplay.propTypes = {
  tokenCounts: PropTypes.shape({
    input_tokens: PropTypes.number,
    output_tokens: PropTypes.number,
    total_tokens: PropTypes.number,
    conversation_tokens: PropTypes.number,
  }),
};

export default TokenCountDisplay;
