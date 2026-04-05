import PropTypes from 'prop-types';
import HighlightedPlainText from './HighlightedPlainText';

export default function ToolExplanationMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  return (
    <div className="tool-explanation-message">
      <HighlightedPlainText
        className="tool-explanation-text"
        text={message.text}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    </div>
  );
}

ToolExplanationMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
