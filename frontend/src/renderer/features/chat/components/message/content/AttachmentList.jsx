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

export default function AttachmentList({
  attachments = [],
  containerClassName = '',
  headerClassName = '',
  headerText = '',
  surface = 'dashboard',
}) {
  const visibleAttachments = readSdkDisplayAttachments(attachments);
  if (visibleAttachments.length === 0) {
    return null;
  }
  const surfaceClass = normalizeSurfaceClass(surface);
  const normalizedContainerClassName = typeof containerClassName === 'string'
    ? containerClassName.trim()
    : '';
  const normalizedHeaderText = typeof headerText === 'string'
    ? headerText.trim()
    : '';
  const normalizedHeaderClassName = typeof headerClassName === 'string' && headerClassName.trim()
    ? headerClassName.trim()
    : 'message-attachment-header';
  const gallery = (
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

  if (normalizedContainerClassName || normalizedHeaderText) {
    return (
      <div className={normalizedContainerClassName || `message-attachment-container message-attachment-container--${surfaceClass}`}>
        {normalizedHeaderText ? (
          <div className={normalizedHeaderClassName}>{normalizedHeaderText}</div>
        ) : null}
        {gallery}
      </div>
    );
  }

  return (
    gallery
  );
}

AttachmentList.propTypes = {
  attachments: PropTypes.arrayOf(PropTypes.object),
  containerClassName: PropTypes.string,
  headerClassName: PropTypes.string,
  headerText: PropTypes.string,
  surface: PropTypes.string,
};
