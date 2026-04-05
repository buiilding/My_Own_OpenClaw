import { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  resolveMessageScreenshotSrcList,
} from '../../../utils/message/messageScreenshots';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import MarkdownMessage from './MarkdownMessage';

export default function UserMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const screenshotSources = resolveMessageScreenshotSrcList(message);
  const attachmentFilenames = Array.isArray(message.attachmentFilenames)
    ? message.attachmentFilenames.filter((filename) => typeof filename === 'string' && filename.length > 0)
    : [];

  const handleScreenshotContextMenu = useCallback((event, screenshotSrc) => {
    if (typeof screenshotSrc !== 'string' || screenshotSrc.trim().length === 0) {
      return;
    }

    event.preventDefault();
    void IpcBridge.invoke(INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU, {
      src: screenshotSrc,
    });
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
                  onContextMenu={(event) => handleScreenshotContextMenu(event, screenshotSrc)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <MarkdownMessage
        text={message.text}
        sender="user"
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
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
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
