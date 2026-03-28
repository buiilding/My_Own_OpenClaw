import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';

export default function ToolActionsSummaryMessage({ message }) {
  const [expanded, setExpanded] = useState(false);
  const actionExplanations = useMemo(() => (
    Array.isArray(message.actionExplanations)
      ? message.actionExplanations.filter((value) => typeof value === 'string' && value.trim())
      : []
  ), [message.actionExplanations]);
  const actionCount = actionExplanations.length;

  return (
    <div className="tool-actions-summary-message">
      <button
        type="button"
        className={`tool-actions-summary-toggle${expanded ? ' is-open' : ''}`}
        onClick={() => setExpanded((previous) => !previous)}
      >
        {expanded ? 'Hide actions' : `View actions${actionCount > 0 ? ` (${actionCount})` : ''}`}
      </button>
      {expanded ? (
        <div className="tool-actions-summary-list" role="list" aria-label="Action explanations">
          {actionExplanations.map((explanation, index) => (
            <div
              key={`${message.id}:action:${index}`}
              className="tool-actions-summary-item"
              role="listitem"
            >
              {explanation}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

ToolActionsSummaryMessage.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string.isRequired,
    actionExplanations: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
};
