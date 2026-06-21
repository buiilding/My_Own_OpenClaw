/**
 * Defines settings section configuration for the renderer UI.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowLeft,
  Globe,
  Palette,
  Settings,
  Database,
  FolderOpen,
  Sparkles,
  Bot,
} from 'lucide-react';
import AgentSettingsTab from './settings/AgentSettingsTab';
import AppearanceSettingsTab from './settings/AppearanceSettingsTab';
import BrowserSettingsTab from './settings/BrowserSettingsTab';
import GeneralSettingsTab from './settings/GeneralSettingsTab';
import MemorySettingsTab from './settings/MemorySettingsTab';
import OnboardingSettingsTab from './settings/OnboardingSettingsTab';
import WorkspaceSettingsTab from './settings/WorkspaceSettingsTab';
import {
  getSettingsTabDescriptors,
  resolveSettingsTabLabel,
} from '../../../../app/runtime/desktopSettingsTabRuntime';
import '../../../../styles/SettingsSurface.css';

const SETTINGS_TAB_ICONS = Object.freeze({
  settings: Settings,
  palette: Palette,
  bot: Bot,
  folderOpen: FolderOpen,
  globe: Globe,
  database: Database,
  sparkles: Sparkles,
});
const SETTINGS_TABS = getSettingsTabDescriptors();

const appearanceThemeSectionShape = PropTypes.shape({
  accent: PropTypes.string,
  background: PropTypes.string,
  foreground: PropTypes.string,
  ui_font: PropTypes.string,
  code_font: PropTypes.string,
  translucent_sidebar: PropTypes.bool,
  contrast: PropTypes.number,
});

function PlaceholderTab({ title }) {
  return (
    <div className="settings-surface-placeholder">
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
    if (activeTab === 'appearance') {
      return <AppearanceSettingsTab config={config} onConfigChange={onConfigChange} />;
    }
    if (activeTab === 'memory') {
      return <MemorySettingsTab onChatsCleared={onChatsCleared} />;
    }
    if (activeTab === 'agent') {
      return <AgentSettingsTab config={config} onConfigChange={onConfigChange} />;
    }
    if (activeTab === 'workspace') {
      return <WorkspaceSettingsTab />;
    }
    if (activeTab === 'browser') {
      return <BrowserSettingsTab />;
    }
    if (activeTab === 'onboarding') {
      return <OnboardingSettingsTab />;
    }

    return <PlaceholderTab title={resolveSettingsTabLabel(activeTab)} />;
  };

  const renderSettingsTabButton = (tab) => {
    const Icon = SETTINGS_TAB_ICONS[tab.iconKey] || Settings;
    return (
      <button
        key={tab.id}
        type="button"
        className={`settings-surface-tab${activeTab === tab.id ? ' active' : ''}`}
        onClick={() => setActiveTab(tab.id)}
        data-testid={`settings-tab-${tab.id}`}
      >
        <Icon size={15} />
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <div className="settings-surface-panel">
      <aside className="settings-surface-sidebar">
        <button
          type="button"
          className="settings-surface-close settings-surface-close-left"
          onClick={onClose}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>

        <nav className="settings-surface-tab-list">
          {SETTINGS_TABS.map(renderSettingsTabButton)}
        </nav>
      </aside>

      <section className="settings-surface-content-wrap">
        <div className="settings-surface-content">
          {renderTabContent()}
        </div>
      </section>
    </div>
  );
}

SettingsSection.propTypes = {
  config: PropTypes.shape({
    show_additional_models: PropTypes.bool,
    show_tool_logs: PropTypes.bool,
    global_agent_stop_shortcut: PropTypes.string,
    agent_custom_instructions: PropTypes.string,
    agent_disabled_local_tools: PropTypes.arrayOf(PropTypes.string),
    agent_disabled_remote_tools: PropTypes.arrayOf(PropTypes.string),
    appearance_mode: PropTypes.oneOf(['light', 'dark', 'system']),
    appearance_theme: PropTypes.shape({
      light: appearanceThemeSectionShape,
      dark: appearanceThemeSectionShape,
    }),
  }),
  onConfigChange: PropTypes.func.isRequired,
  initialTab: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onChatsCleared: PropTypes.func,
};

export default SettingsSection;
