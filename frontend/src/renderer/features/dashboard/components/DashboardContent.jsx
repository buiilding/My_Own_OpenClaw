import PropTypes from 'prop-types';
import MemorySection from './sections/MemorySection';
import ProceduralSection from './sections/ProceduralSection';
import ModelsSection from './sections/ModelsSection';
import UsageSection from './sections/UsageSection';
import SettingsSection from './sections/SettingsSection';
import '../../../styles/SettingsPanel.css';

function DashboardContent({ sectionId, config, availableModels, onConfigChange }) {
  switch (sectionId) {
    case 'episodic':
      return (
        <MemorySection
          title="Episodic Memory"
          description="Conversation summaries and short-term recall."
        />
      );
    case 'semantic':
      return (
        <MemorySection
          title="Semantic Memory"
          description="Long-term facts and preferences."
        />
      );
    case 'procedural':
      return <ProceduralSection />;
    case 'models':
      return (
        <ModelsSection
          config={config}
          availableModels={availableModels}
          onConfigChange={onConfigChange}
        />
      );
    case 'usage':
      return <UsageSection />;
    case 'settings':
      return (
        <SettingsSection
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    default:
      return (
        <div className="settings-panel">
          <div className="settings-header">
            <div>
              <h2>Section</h2>
              <p>Select an area from the left.</p>
            </div>
          </div>
        </div>
      );
  }
}

DashboardContent.propTypes = {
  sectionId: PropTypes.string.isRequired,
  config: PropTypes.shape({}),
  availableModels: PropTypes.shape({
    local: PropTypes.array,
    online: PropTypes.array,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

export default DashboardContent;
