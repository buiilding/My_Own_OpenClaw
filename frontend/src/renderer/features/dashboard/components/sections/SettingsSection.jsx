import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  X,
  Settings,
  Database,
} from 'lucide-react';
import PermissionControlCenter from '../../../permissions/components/PermissionControlCenter';
import GeneralSettingsTab from './settings/GeneralSettingsTab';
import MemorySettingsTab from './settings/MemorySettingsTab';
import '../../../../styles/CloneSettings.css';

const SETTINGS_TABS = Object.freeze([
  { id: 'general', icon: Settings, label: 'General' },
  { id: 'memory', icon: Database, label: 'Memory' },
]);

function PlaceholderTab({ title }) {
  return (
    <div className="clone-settings-placeholder">
      <h2>{title}</h2>
      <p>Settings for {title.toLowerCase()} will appear here.</p>
    </div>
  );
}

PlaceholderTab.propTypes = {
  title: PropTypes.string.isRequired,
};

function SettingsSection({
  config,
  onConfigChange,
  initialTab = 'general',
  onClose,
  onChatsCleared,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab || 'general');
  }, [initialTab]);

  const renderTabContent = () => {
    if (activeTab === 'general') {
      return <GeneralSettingsTab config={config} onConfigChange={onConfigChange} />;
    }
    if (activeTab === 'memory') {
      return <MemorySettingsTab onChatsCleared={onChatsCleared} />;
    }
    if (activeTab === 'data-controls') {
      return <PermissionControlCenter />;
    }

    const tab = SETTINGS_TABS.find((item) => item.id === activeTab);
    return <PlaceholderTab title={tab?.label || 'Settings'} />;
  };

  return (
    <div className="clone-settings-panel">
      <aside className="clone-settings-sidebar">
        <button
          type="button"
          className="clone-settings-close clone-settings-close-left"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={18} />
        </button>

        <nav className="clone-settings-tab-list">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`clone-settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`settings-tab-${tab.id}`}
            >
              <tab.icon size={15} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="clone-settings-content-wrap">
        <div className="clone-settings-content">
          {renderTabContent()}
        </div>
      </section>
    </div>
  );
}

SettingsSection.propTypes = {
  config: PropTypes.shape({
    show_additional_models: PropTypes.bool,
    agent_full_sudo_enabled: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
  }),
  onConfigChange: PropTypes.func.isRequired,
  initialTab: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onChatsCleared: PropTypes.func,
};

export default SettingsSection;
