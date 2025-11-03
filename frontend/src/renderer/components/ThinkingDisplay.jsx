import PropTypes from 'prop-types';
import '../styles/ThinkingDisplay.css';

/**
 * A component to display the agent's current thinking status.
 * It shows a subtle animation and the status message.
 *
 * @param {object} props - The component's props.
 * @param {string} props.status - The status message to display.
 */
function ThinkingDisplay({ status }) {
  if (!status) {
    return null;
  }

  return (
    <div className="thinking-display" role="status" aria-live="polite">
      <div className="thinking-spinner"></div>
      <p className="thinking-text">{status}</p>
    </div>
  );
}

ThinkingDisplay.propTypes = {
  status: PropTypes.string,
};

export default ThinkingDisplay;
