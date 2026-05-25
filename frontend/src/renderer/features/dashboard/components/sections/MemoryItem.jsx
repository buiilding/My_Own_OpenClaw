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
    <div className="clone-memory-item">
      <div
        className="clone-memory-item-header"
        onClick={() => {
          onToggleExpand();
        }}
      >
        <button type="button" className="clone-memory-expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="clone-memory-item-main">
          <div className="clone-memory-item-title-row">
            <h4 className="clone-memory-item-title">{memory.title}</h4>
          </div>

          <div className="clone-memory-item-meta-row">
            {type === 'episodic' ? (
              <>
                <span>{memory.date}</span>
                <span className="clone-memory-separator">·</span>
                <span>{memory.tokens} tokens</span>
              </>
            ) : null}

            {type === 'semantic' ? (
              <>
                <span className={`clone-memory-confidence ${memory.confidence === 'High' ? 'high' : 'medium'}`}>
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

        <div className="clone-memory-item-actions">
          <button type="button" className="clone-memory-action-btn delete" onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }} aria-label="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="clone-memory-item-body">
          <p className="clone-memory-item-detail">{memory.detail}</p>
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
