import PropTypes from 'prop-types';
import HighlightedPlainText from './HighlightedPlainText';

export default function ErrorMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  return (
    <div className="error-message-container">
      <div className="error-header">⚠️ Error</div>
      <HighlightedPlainText
        as="div"
        className="error-content"
        text={message.text}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    </div>
  );
}

ErrorMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
