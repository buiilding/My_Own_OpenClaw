/**
 * Defines appearance settings tab configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { Monitor, Moon, Sun } from 'lucide-react';
import { CloneToggle } from './settingsControls';
import { DEFAULT_APPEARANCE_THEME } from '../../../../../app/skin/desktopRuntimeConfig';

const THEME_MODE_OPTIONS = Object.freeze([
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]);

const THEME_SECTIONS = Object.freeze([
  { id: 'light', title: 'Light theme' },
  { id: 'dark', title: 'Dark theme' },
]);

const THEME_FIELDS = Object.freeze([
  { key: 'accent', label: 'Accent', kind: 'color' },
  { key: 'background', label: 'Background', kind: 'color' },
  { key: 'foreground', label: 'Foreground', kind: 'color' },
  { key: 'ui_font', label: 'UI font', kind: 'font' },
  { key: 'code_font', label: 'Code font', kind: 'font' },
  { key: 'translucent_sidebar', label: 'Translucent sidebar', kind: 'toggle' },
  { key: 'contrast', label: 'Contrast', kind: 'range' },
]);

function normalizeThemeConfig(config) {
  return {
    light: {
      ...DEFAULT_APPEARANCE_THEME.light,
      ...(config?.appearance_theme?.light || {}),
    },
    dark: {
      ...DEFAULT_APPEARANCE_THEME.dark,
      ...(config?.appearance_theme?.dark || {}),
    },
  };
}

function getPillTextColor(value) {
  return String(value || '').toUpperCase() === '#FFFFFF' ? 'var(--agent-black)' : '#ffffff';
}

function AppearanceSettingsTab({ config, onConfigChange }) {
  const appearanceTheme = normalizeThemeConfig(config);
  const appearanceMode = ['light', 'dark', 'system'].includes(config?.appearance_mode)
    ? config.appearance_mode
    : 'system';

  const updateAppearanceMode = (mode) => {
    onConfigChange({ appearance_mode: mode });
  };

  const updateThemeValue = (themeId, key, value) => {
    onConfigChange({
      appearance_theme: {
        ...appearanceTheme,
        [themeId]: {
          ...appearanceTheme[themeId],
          [key]: value,
        },
      },
    });
  };

  return (
    <div className="clone-settings-general clone-settings-appearance">
      <h2>Appearance</h2>

      <section className="clone-settings-theme-mode-card" aria-label="Theme">
        <div>
          <h3>Theme</h3>
          <p>Use light, dark, or match your system</p>
        </div>
        <div className="clone-settings-theme-mode-segment" role="group" aria-label="Theme mode">
          {THEME_MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = appearanceMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={isActive ? 'active' : ''}
                aria-pressed={isActive}
                onClick={() => updateAppearanceMode(option.value)}
              >
                <Icon size={18} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {THEME_SECTIONS.map((section) => {
        const theme = appearanceTheme[section.id];
        return (
          <section key={section.id} className="clone-settings-theme-card" aria-label={section.title}>
            <header className="clone-settings-theme-card-header">
              <h3>{section.title}</h3>
            </header>

            <div className="clone-settings-theme-grid">
              {THEME_FIELDS.map((field) => (
                <ThemeField
                  key={`${section.id}-${field.key}`}
                  themeId={section.id}
                  field={field}
                  value={theme[field.key]}
                  onChange={(value) => updateThemeValue(section.id, field.key, value)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ThemeField({
  themeId,
  field,
  value,
  onChange,
}) {
  const label = `${themeId === 'light' ? 'Light' : 'Dark'} theme ${field.label.toLowerCase()}`;

  if (field.kind === 'toggle') {
    return (
      <div className="clone-settings-theme-row">
        <span>{field.label}</span>
        <CloneToggle
          checked={value === true}
          ariaLabel={label}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === 'range') {
    const contrast = Number.isFinite(Number(value)) ? Number(value) : 0;
    return (
      <div className="clone-settings-theme-row">
        <span>{field.label}</span>
        <div className="clone-settings-contrast-control">
          <input
            type="range"
            min="0"
            max="100"
            value={contrast}
            aria-label={label}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <output>{contrast}</output>
        </div>
      </div>
    );
  }

  if (field.kind === 'font') {
    return (
      <label className="clone-settings-theme-row">
        <span>{field.label}</span>
        <input
          className="clone-settings-font-input"
          type="text"
          value={value || ''}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="clone-settings-theme-row">
      <span>{field.label}</span>
      <span
        className="clone-settings-color-pill"
        style={{
          background: value,
          color: getPillTextColor(value),
        }}
      >
        <span className="clone-settings-color-dot" aria-hidden="true" />
        <input
          type="text"
          value={value || ''}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

const themeSectionShape = PropTypes.shape({
  accent: PropTypes.string,
  background: PropTypes.string,
  foreground: PropTypes.string,
  ui_font: PropTypes.string,
  code_font: PropTypes.string,
  translucent_sidebar: PropTypes.bool,
  contrast: PropTypes.number,
});

AppearanceSettingsTab.propTypes = {
  config: PropTypes.shape({
    appearance_mode: PropTypes.oneOf(['light', 'dark', 'system']),
    appearance_theme: PropTypes.shape({
      light: themeSectionShape,
      dark: themeSectionShape,
    }),
  }),
  onConfigChange: PropTypes.func.isRequired,
};

ThemeField.propTypes = {
  themeId: PropTypes.oneOf(['light', 'dark']).isRequired,
  field: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['color', 'font', 'toggle', 'range']).isRequired,
  }).isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.bool,
    PropTypes.number,
  ]),
  onChange: PropTypes.func.isRequired,
};

export default AppearanceSettingsTab;
