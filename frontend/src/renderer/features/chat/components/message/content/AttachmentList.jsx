/**
 * Presents SDK-owned message attachments in projection order.
 */

import PropTypes from 'prop-types';
import {
  DesktopSdkDisplayAttachmentProjection,
} from '../../../../../app/runtime/desktopSdkDisplayAttachmentProjection';
import AttachmentRendererRegistry from './AttachmentRendererRegistry';

const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

function normalizeSurfaceClass(surface) {
  return typeof surface === 'string' && /^[a-z0-9_-]+$/i.test(surface)
    ? surface
    : 'dashboard';
}

export default function AttachmentList({ attachments = [], surface = 'dashboard' }) {
  const visibleAttachments = readSdkDisplayAttachments(attachments);
  if (visibleAttachments.length === 0) {
    return null;
  }
  const surfaceClass = normalizeSurfaceClass(surface);

  return (
    <div className={`message-attachment-gallery message-attachment-gallery--${surfaceClass}`}>
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
  attachments: PropTypes.arrayOf(PropTypes.object),
  surface: PropTypes.string,
};
