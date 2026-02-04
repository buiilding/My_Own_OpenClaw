import PropTypes from 'prop-types';
import '../../../../styles/SettingsPanel.css';

function MemorySection({ title, description }) {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <section className="settings-section">
        <h3>Status</h3>
        <div className="settings-card">
          <div className="settings-card-title">Coming soon</div>
          <div className="settings-card-desc">Memory management will land here.</div>
        </div>
      </section>
    </div>
  );
}

MemorySection.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
};

export default MemorySection;
