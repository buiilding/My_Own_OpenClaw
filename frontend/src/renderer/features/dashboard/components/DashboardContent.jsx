import PropTypes from 'prop-types';
import EpisodicMemorySection from './sections/EpisodicMemorySection';
import SemanticMemorySection from './sections/SemanticMemorySection';
import ProceduralSection from './sections/ProceduralSection';
import ModelsSection from './sections/ModelsSection';
import UsageSection from './sections/UsageSection';
import SettingsSection from './sections/SettingsSection';
import '../../../styles/SettingsPanel.css';

function DashboardContent({ sectionId, config, availableModels, onConfigChange, onSelectSection }) {
  switch (sectionId) {
    case 'episodic':
      return <EpisodicMemorySection onSelectSection={onSelectSection} />;
    case 'semantic':
      return <SemanticMemorySection />;
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
  onSelectSection: PropTypes.func,
};

export default DashboardContent;
