/**
 * Routes SDK display attachments to focused user-message attachment renderers.
 */

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { DesktopArtifactRuntimeClient } from '../../../../../app/runtime/desktopArtifactRuntimeClient';
import {
  DesktopResolvedMessageScreenshotsRuntime,
} from '../../../../../app/runtime/desktopResolvedMessageScreenshotsRuntime';

function ImageAttachment({ attachment }) {
  const resolvedArtifactSrc = DesktopResolvedMessageScreenshotsRuntime.useResolvedArtifactImageSrc(attachment);
  const [lastVisibleSrc, setLastVisibleSrc] = useState(null);
  const src = attachment.status === 'materializing'
    ? attachment.previewSrc
    : resolvedArtifactSrc ?? lastVisibleSrc;

  useEffect(() => {
    if (typeof src === 'string' && src.trim().length > 0) {
      setLastVisibleSrc(src);
    }
  }, [src]);

  const handleContextMenu = useCallback((event) => {
    if (typeof src !== 'string' || src.trim().length === 0) {
      return;
    }
    event.preventDefault();
    void DesktopArtifactRuntimeClient.showImageContextMenu({ src });
  }, [src]);

  if (!src) {
    return null;
  }

  return (
    <div className="user-screenshot-container">
      <div className="user-screenshot-frame">
        <img
          src={src}
          alt="User message attachment"
          className="user-screenshot-image"
          loading="lazy"
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}

function PendingScreenshotAttachment({ surface }) {
  if (surface === 'compact') {
    return null;
  }
  return (
    <div className="user-file-attachment-pill user-file-attachment-pill-pending">
      Screenshot pending
    </div>
  );
}

function FailedAttachment({ attachment, surface }) {
  if (surface === 'compact') {
    return null;
  }
  const label = attachment.kind === 'screenshot_request'
    ? 'Screenshot unavailable'
    : 'Attachment unavailable';
  return (
    <div className="user-file-attachment-pill user-file-attachment-pill-error">
      {label}
    </div>
  );
}

export default function AttachmentRendererRegistry({ attachment, surface = 'dashboard' }) {
  if (attachment.status === 'failed') {
    return <FailedAttachment attachment={attachment} surface={surface} />;
  }
  if (attachment.kind === 'screenshot_request') {
    return <PendingScreenshotAttachment surface={surface} />;
  }
  if (attachment.kind === 'image') {
    return <ImageAttachment attachment={attachment} />;
  }
  return null;
}

const attachmentShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  kind: PropTypes.oneOf(['image', 'screenshot_request']).isRequired,
  source: PropTypes.oneOf(['user_included', 'camera_button', 'tool_result', 'replay']).isRequired,
  status: PropTypes.oneOf(['materializing', 'pending_capture', 'ready', 'failed']).isRequired,
  filename: PropTypes.string,
  contentType: PropTypes.string,
  previewSrc: PropTypes.string,
  screenshotRef: PropTypes.string,
  screenshotUrl: PropTypes.string,
  errorCode: PropTypes.string,
});

ImageAttachment.propTypes = {
  attachment: attachmentShape.isRequired,
};

PendingScreenshotAttachment.propTypes = {
  surface: PropTypes.string,
};

FailedAttachment.propTypes = {
  attachment: attachmentShape.isRequired,
  surface: PropTypes.string,
};

AttachmentRendererRegistry.propTypes = {
  attachment: attachmentShape.isRequired,
  surface: PropTypes.string,
};
