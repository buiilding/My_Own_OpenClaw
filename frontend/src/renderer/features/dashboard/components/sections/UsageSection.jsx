import PropTypes from 'prop-types';
import { X } from 'lucide-react';

function UsageSection({ onClose = () => {} }) {
  return (
    <div className="clone-model-panel">
      <div className="clone-panel-close-row">
        <button
          type="button"
          className="clone-panel-close"
          onClick={onClose}
          aria-label="Close usage"
        >
          <X size={18} />
        </button>
      </div>
      <div className="clone-panel-header">
        <h1>Usage</h1>
        <p>Track usage activity and limits.</p>
      </div>
      <div className="clone-panel-body">
        <div className="clone-empty-state">Usage insights will appear here.</div>
      </div>
    </div>
  );
}

UsageSection.propTypes = {
  onClose: PropTypes.func,
};

export default UsageSection;
