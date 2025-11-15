import { useState } from 'react';
import PropTypes from 'prop-types';
import '../styles/ThinkingDisplay.css';

/**
 * A component to display the agent's current thinking status.
 * Shows accumulated thinking tokens from Gemini models in a collapsible format.
 *
 * @param {object} props - The component's props.
 * @param {string} props.status - The accumulated thinking tokens to display.
 */
function ThinkingDisplay({ status }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!status) {
    return null;
  }

  // Check if this looks like thinking tokens (more than just a simple status message)
  const isThinkingTokens = status.length > 50 || status.includes('\n') || status.includes('thinking');

  return (
    <div className="thinking-display" role="status" aria-live="polite">
      <div className="thinking-header" onClick={() => setIsExpanded(!isExpanded)}>
      <div className="thinking-spinner"></div>
        <span className="thinking-label">
          {isThinkingTokens ? '🧠 Model Reasoning' : 'Thinking...'}
        </span>
        {isThinkingTokens && (
          <span className="thinking-toggle">{isExpanded ? '▼' : '▶'}</span>
        )}
      </div>
      {isThinkingTokens ? (
        <div className={`thinking-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
          <pre className="thinking-text">{status}</pre>
        </div>
      ) : (
      <p className="thinking-text">{status}</p>
      )}
    </div>
  );
}

ThinkingDisplay.propTypes = {
  status: PropTypes.string,
};

export default ThinkingDisplay;
