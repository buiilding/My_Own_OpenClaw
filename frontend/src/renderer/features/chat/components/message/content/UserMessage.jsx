import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import {
  resolveMessageScreenshotSrcList,
} from '../../../utils/message/messageScreenshots';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import MarkdownMessage from './MarkdownMessage';

export default function UserMessage({ message }) {
  const screenshotSources = resolveMessageScreenshotSrcList(message);
  const attachmentFilenames = Array.isArray(message.attachmentFilenames)
    ? message.attachmentFilenames.filter((filename) => typeof filename === 'string' && filename.length > 0)
    : [];
  const [copyingScreenshotSrc, setCopyingScreenshotSrc] = useState(null);

  const handleCopyImage = useCallback(async (imageSrc) => {
    if (typeof imageSrc !== 'string' || imageSrc.trim().length === 0) {
      return;
    }

    setCopyingScreenshotSrc(imageSrc);

    try {
      const copyResult = await IpcBridge.invoke(INVOKE_CHANNELS.COPY_IMAGE_TO_CLIPBOARD, {
        src: imageSrc,
      });
      if (!copyResult?.success) {
        throw new Error(copyResult?.error || 'Clipboard image copy failed.');
      }
    } catch (error) {
      console.warn('[UserMessage] Failed to copy image to clipboard:', error);
    } finally {
      setCopyingScreenshotSrc((currentSrc) => (currentSrc === imageSrc ? null : currentSrc));
    }
  }, []);

  return (
    <div className="user-message-container">
      {attachmentFilenames.length > 0 ? (
        <div className="user-file-attachments">
          {attachmentFilenames.map((filename, index) => (
            <span className="user-file-attachment-pill" key={`${filename}-${index}`}>
              {filename}
            </span>
          ))}
        </div>
      ) : null}
      {screenshotSources.length > 0 ? (
        <div className="user-screenshot-gallery">
          {screenshotSources.map((screenshotSrc, index) => (
            <div className="user-screenshot-container" key={`${screenshotSrc}-${index}`}>
              <div className="user-screenshot-frame">
                <img
                  src={screenshotSrc}
                  alt={screenshotSources.length > 1 ? `User message screenshot ${index + 1}` : 'User message screenshot'}
                  className="user-screenshot-image"
                  loading="lazy"
                />
              </div>
              <button
                type="button"
                className="user-screenshot-copy-button"
                onClick={() => {
                  void handleCopyImage(screenshotSrc);
                }}
                disabled={copyingScreenshotSrc === screenshotSrc}
              >
                {copyingScreenshotSrc === screenshotSrc ? 'Copying...' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <MarkdownMessage text={message.text} sender="user" />
    </div>
  );
}

UserMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    attachmentFilenames: PropTypes.arrayOf(PropTypes.string),
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
    screenshots: PropTypes.arrayOf(PropTypes.shape({
      screenshot: PropTypes.string,
      screenshotRef: PropTypes.string,
      screenshotUrl: PropTypes.string,
      screenshotContentType: PropTypes.string,
    })),
  }).isRequired,
};
