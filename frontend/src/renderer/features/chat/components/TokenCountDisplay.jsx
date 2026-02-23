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
    total_tokens: PropTypes.number,
    conversation_tokens: PropTypes.number,
    cached_tokens: PropTypes.number,
    cache_hit: PropTypes.bool,
    cache_status: PropTypes.oneOf(['hit', 'miss', 'unknown']),
  }),
};

export default TokenCountDisplay;
