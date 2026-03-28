import PropTypes from 'prop-types';

export default function ToolExplanationMessage({ message }) {
  return (
    <div className="tool-explanation-message">
      <span className="tool-explanation-text">{message.text}</span>
    </div>
  );
}

ToolExplanationMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
  }).isRequired,
};
