/**
 * Provides the user message module for the renderer UI.
 */

import PropTypes from 'prop-types';
import AttachmentList from './AttachmentList';
import MarkdownMessage from './MarkdownMessage';

export default function UserMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const displayAttachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];
  const hasDisplayAttachments = displayAttachments.length > 0;

  return (
    <div className="user-message-container">
      {hasDisplayAttachments ? (
        <AttachmentList attachments={displayAttachments} />
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
    attachments: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      kind: PropTypes.oneOf(['image', 'screenshot_request']).isRequired,
      source: PropTypes.oneOf(['user_included', 'camera_button', 'tool_result', 'replay']).isRequired,
      status: PropTypes.oneOf(['materializing', 'pending_capture', 'ready', 'failed']).isRequired,
    })),
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
