import PropTypes from 'prop-types';
import { buildTokenCountItems } from '../utils/tokenCounts';
import '../../../styles/TokenCountDisplay.css';

function TokenCountDisplay({ tokenCounts }) {
  if (!tokenCounts) {
    return null;
  }

  const countItems = buildTokenCountItems(tokenCounts);

  return (
    <div className="token-count-display">
      {countItems.map((item) => (
        <div
          key={item.key}
          className={`token-count-item${item.className ? ` ${item.className}` : ''}`}
        >
          <span className="token-label">{item.label}:</span>
          <span className="token-value">{item.value}</span>
        </div>
      ))}
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
