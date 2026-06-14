/**
 * Defines settings controls configuration for the renderer UI.
 */

import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

export function SelectDropdown({
  value,
  options,
  onChange,
  showSwatch = false,
  className = '',
}) {
  return (
    <div className={['clone-settings-select-wrap', className].filter(Boolean).join(' ')}>
      {showSwatch ? <span className="clone-settings-swatch" aria-hidden="true" /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="clone-settings-select">
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>
            {option.label || option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

SelectDropdown.propTypes = {
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ])).isRequired,
  onChange: PropTypes.func.isRequired,
  showSwatch: PropTypes.bool,
  className: PropTypes.string,
};

export function CloneToggle({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}) {
  return (
    <label className={`clone-settings-toggle${checked ? ' checked' : ''}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span className="clone-settings-toggle-thumb" />
    </label>
  );
}

CloneToggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
};
