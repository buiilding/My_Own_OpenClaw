/**
 * Provides the memory item module for the renderer UI.
 */

import PropTypes from 'prop-types';
import {
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react';

function MemoryItem({
  memory,
  type,
  expanded,
  onToggleExpand,
  onDelete,
}) {
  return (
    <div className="memory-surface-item">
      <div
        className="memory-surface-item-header"
        onClick={() => {
          onToggleExpand();
        }}
      >
        <button type="button" className="memory-surface-expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="memory-surface-item-main">
          <div className="memory-surface-item-title-row">
            <h4 className="memory-surface-item-title">{memory.title}</h4>
          </div>

          <div className="memory-surface-item-meta-row">
            {type === 'episodic' ? (
              <>
                <span>{memory.date}</span>
                <span className="memory-surface-separator">·</span>
                <span>{memory.tokens} tokens</span>
              </>
            ) : null}

            {type === 'semantic' ? (
              <>
                <span className={`memory-surface-confidence ${memory.confidence === 'High' ? 'high' : 'medium'}`}>
                  {memory.confidence}
                </span>
                <span>{memory.source}</span>
              </>
            ) : null}

            {type === 'procedural' ? (
              <span>No procedural memory entries yet.</span>
            ) : null}
          </div>
        </div>

        <div className="memory-surface-item-actions">
          <button type="button" className="memory-surface-action-btn delete" onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }} aria-label="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="memory-surface-item-body">
          <p className="memory-surface-item-detail">{memory.detail}</p>
        </div>
      ) : null}
    </div>
  );
}

MemoryItem.propTypes = {
  memory: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    detail: PropTypes.string.isRequired,
    date: PropTypes.string,
    tokens: PropTypes.number,
    confidence: PropTypes.string,
    source: PropTypes.string,
  }).isRequired,
  type: PropTypes.oneOf(['episodic', 'semantic', 'procedural']).isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggleExpand: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default MemoryItem;
