import PropTypes from 'prop-types';

export default function ErrorMessage({ message }) {
  return (
    <div className="error-message-container">
      <div className="error-header">⚠️ Error</div>
      <div className="error-content">{message.text}</div>
    </div>
  );
}

ErrorMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
  }).isRequired,
};
