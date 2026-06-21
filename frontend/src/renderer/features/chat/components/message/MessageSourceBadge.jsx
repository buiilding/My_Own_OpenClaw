/**
 * Provides the message source badge module for the renderer UI.
 */

import PropTypes from 'prop-types';
import { DesktopDevUiRuntime } from '../../../../app/runtime/desktopDevUiRuntime';
import { DesktopMessageSourceTagRuntime } from '../../../../app/runtime/desktopMessageSourceTagRuntime';

export default function MessageSourceBadge({ message }) {
  if (!DesktopDevUiRuntime.isDevUiEnabled()) {
    return null;
  }

  const presentation = DesktopMessageSourceTagRuntime.resolveMessageSourceBadgePresentation(message);

  return (
    <div className="message-source-badge" title={presentation.title}>
      {presentation.badgeText}
    </div>
  );
}

MessageSourceBadge.propTypes = {
  message: PropTypes.object.isRequired,
};
