/**
 * Provides the usage section module for the renderer UI.
 */

import PropTypes from 'prop-types';
import { X } from 'lucide-react';

function UsageSection({ onClose = () => {} }) {
  return (
    <div className="dashboard-panel-surface">
      <div className="dashboard-panel-close-row">
        <button
          type="button"
          className="dashboard-panel-close"
          onClick={onClose}
          aria-label="Close usage"
        >
          <X size={18} />
        </button>
      </div>
      <div className="dashboard-panel-header">
        <h1>Usage</h1>
        <p>Track usage activity and limits.</p>
      </div>
      <div className="dashboard-panel-body">
        <div className="dashboard-empty-state">Usage insights will appear here.</div>
      </div>
    </div>
  );
}

UsageSection.propTypes = {
  onClose: PropTypes.func,
};

export default UsageSection;
