/**
 * Provides the stop shortcut onboarding slide module for the renderer UI.
 */

import { Fragment, useMemo } from 'react';
import PropTypes from 'prop-types';

function StopShortcutOnboardingSlide({ stopShortcutLabel }) {
  const stopShortcutSegments = useMemo(() => {
    const segments = stopShortcutLabel
      .split(/\s*\+\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments.length > 0 ? segments : [stopShortcutLabel];
  }, [stopShortcutLabel]);

  return (
    <div className="desktop-onboarding-stop-flow">
      <div
        className="desktop-onboarding-stop-flow-keybind"
        aria-label={`Stop shortcut ${stopShortcutLabel}`}
      >
        <span className="desktop-onboarding-stop-flow-keybind-label">
          Keybind
        </span>
        <div className="desktop-onboarding-stop-flow-keycap-row" aria-hidden="true">
          {stopShortcutSegments.map((segment, index) => (
            <Fragment key={`${segment}-${index}`}>
              {index > 0 ? (
                <span className="desktop-onboarding-stop-flow-keycap-separator">+</span>
              ) : null}
              <kbd className="desktop-onboarding-stop-flow-keycap">{segment}</kbd>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

StopShortcutOnboardingSlide.propTypes = {
  stopShortcutLabel: PropTypes.string.isRequired,
};

export default StopShortcutOnboardingSlide;
