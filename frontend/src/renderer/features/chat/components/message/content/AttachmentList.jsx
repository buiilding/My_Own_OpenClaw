/**
 * Presents SDK-owned message attachments in projection order.
 */

import PropTypes from 'prop-types';
import AttachmentRendererRegistry from './AttachmentRendererRegistry';

function normalizeSurfaceClass(surface) {
  return typeof surface === 'string' && /^[a-z0-9_-]+$/i.test(surface)
    ? surface
    : 'dashboard';
}

export default function AttachmentList({ attachments = [], surface = 'dashboard' }) {
  const visibleAttachments = attachments.filter((attachment) => (
    attachment
    && typeof attachment.id === 'string'
    && attachment.id.length > 0
  ));
  if (visibleAttachments.length === 0) {
    return null;
  }
  const surfaceClass = normalizeSurfaceClass(surface);

  return (
    <div className={`user-screenshot-gallery message-attachment-gallery message-attachment-gallery--${surfaceClass}`}>
      {visibleAttachments.map((attachment) => (
        <AttachmentRendererRegistry
          attachment={attachment}
          key={attachment.id}
          surface={surface}
        />
      ))}
    </div>
  );
}

AttachmentList.propTypes = {
  attachments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['image', 'screenshot_request']).isRequired,
    source: PropTypes.oneOf(['user_included', 'camera_button', 'tool_result', 'replay']).isRequired,
    status: PropTypes.oneOf(['materializing', 'pending_capture', 'ready', 'failed']).isRequired,
  })),
  surface: PropTypes.string,
};
