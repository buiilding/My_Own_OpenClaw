import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  X,
  Settings,
  Bell,
  Sparkles,
  LayoutGrid,
  Clock,
  FileText,
  Shield,
  Users,
  User,
  ChevronDown,
  Play,
} from 'lucide-react';
import '../../../../styles/CloneSettings.css';

const SETTINGS_TABS = Object.freeze([
  { id: 'general', icon: Settings, label: 'General' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'personalization', icon: Sparkles, label: 'Personalization' },
  { id: 'apps', icon: LayoutGrid, label: 'Apps' },
  { id: 'schedules', icon: Clock, label: 'Schedules' },
  { id: 'orders', icon: FileText, label: 'Orders' },
  { id: 'data-controls', icon: Shield, label: 'Data controls' },
  { id: 'security', icon: Shield, label: 'Security' },
  { id: 'parental-controls', icon: Users, label: 'Parental controls' },
  { id: 'account', icon: User, label: 'Account' },
]);

function SelectDropdown({ value, options, onChange, showSwatch = false }) {
  return (
    <div className="clone-settings-select-wrap">
      {showSwatch ? <span className="clone-settings-swatch" aria-hidden="true" /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="clone-settings-select">
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

SelectDropdown.propTypes = {
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  showSwatch: PropTypes.bool,
};

function CloneToggle({ checked, onChange }) {
  return (
    <label className={`clone-settings-toggle${checked ? ' checked' : ''}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="clone-settings-toggle-thumb" />
    </label>
  );
}

CloneToggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

function GeneralTab({ config, onConfigChange }) {
  const [appearance, setAppearance] = useState('System');
  const [accentColor, setAccentColor] = useState('Black');
  const [language, setLanguage] = useState('Auto-detect');
  const [spokenLanguage, setSpokenLanguage] = useState('English');
  const [voice, setVoice] = useState('Spruce');
  const [separateVoice, setSeparateVoice] = useState(false);
  const showAdditionalModels = config?.show_additional_models ?? true;

  const handleShowAdditionalModelsChange = (enabled) => {
    onConfigChange({
      ...(config || {}),
      show_additional_models: enabled,
    });
  };

  return (
    <div className="clone-settings-general">
      <h2>General</h2>

      <div className="clone-settings-row">
        <span>Appearance</span>
        <SelectDropdown
          value={appearance}
          options={['System', 'Light', 'Dark']}
          onChange={setAppearance}
        />
      </div>

      <div className="clone-settings-row">
        <span>Accent color</span>
        <SelectDropdown
          value={accentColor}
          options={['Black', 'Blue', 'Green', 'Purple']}
          onChange={setAccentColor}
          showSwatch
        />
      </div>

      <div className="clone-settings-row">
        <span>Language</span>
        <SelectDropdown
          value={language}
          options={['Auto-detect', 'English', 'Spanish', 'French', 'German']}
          onChange={setLanguage}
        />
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Spoken language</span>
          <p>
            For best results, select the language you mainly speak. If it&apos;s not listed, it may
            still be supported via auto-detection.
          </p>
        </div>
        <SelectDropdown
          value={spokenLanguage}
          options={['English', 'Spanish', 'French', 'German', 'Japanese']}
          onChange={setSpokenLanguage}
        />
      </div>

      <div className="clone-settings-row">
        <span>Voice</span>
        <div className="clone-settings-voice-wrap">
          <button type="button" className="clone-settings-play-button">
            <Play size={12} />
            Play
          </button>
          <SelectDropdown
            value={voice}
            options={['Spruce', 'Breeze', 'Cove', 'Ember']}
            onChange={setVoice}
          />
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <span>Separate Voice</span>
          <p>
            Keep ChatGPT Voice in a separate full screen, without real time transcripts and visuals.
          </p>
        </div>
        <CloneToggle checked={separateVoice} onChange={setSeparateVoice} />
      </div>

      <div className="clone-settings-row">
        <span>Show additional models</span>
        <CloneToggle
          checked={showAdditionalModels}
          onChange={handleShowAdditionalModelsChange}
        />
      </div>
    </div>
  );
}

GeneralTab.propTypes = {
  config: PropTypes.shape({
    show_additional_models: PropTypes.bool,
  }),
  onConfigChange: PropTypes.func.isRequired,
};

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

function SettingsSection({ config, onConfigChange, initialTab = 'general', onClose }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab || 'general');
  }, [initialTab]);

  const renderTabContent = () => {
    if (activeTab === 'general') {
      return <GeneralTab config={config} onConfigChange={onConfigChange} />;
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
        <button
          type="button"
          className="clone-settings-close clone-settings-close-right"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X size={16} />
        </button>
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
  }),
  onConfigChange: PropTypes.func.isRequired,
  initialTab: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default SettingsSection;
