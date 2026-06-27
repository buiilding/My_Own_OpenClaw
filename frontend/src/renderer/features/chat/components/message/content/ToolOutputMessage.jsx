/**
 * Provides the tool output message module for the renderer UI.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  DesktopSdkDisplayAttachmentProjection,
} from '../../../../../app/runtime/desktopSdkDisplayAttachmentProjection';
import AttachmentList from './AttachmentList';
import HighlightedPlainText from './HighlightedPlainText';

const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

export default function ToolOutputMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const [showDetails, setShowDetails] = useState(false);
  const displayAttachments = readSdkDisplayAttachments(message.attachments);
  const modelFacingOutput = (
    typeof message.modelFacingToolOutput === 'string'
      ? message.modelFacingToolOutput
      : message.text
  );
  const detailsPayload = (
    message.toolOutputDetails
    && typeof message.toolOutputDetails === 'object'
    && !Array.isArray(message.toolOutputDetails)
  )
    ? message.toolOutputDetails
    : {};

  return (
    <div className="tool-output-container">
      <div className="tool-card-header-row">
        <div className="tool-output-header">📤 Tool Output</div>
        <button
          type="button"
          className="tool-details-btn"
          onClick={() => setShowDetails((previous) => !previous)}
        >
          Details
        </button>
      </div>
      <HighlightedPlainText
        as="pre"
        className="tool-output-content"
        text={modelFacingOutput}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
      {displayAttachments.length > 0 ? (
        <div className="tool-attachment-container">
          <div className="tool-attachment-header">Visual Output</div>
          <AttachmentList attachments={displayAttachments} surface="tool-output" />
        </div>
      ) : null}
      {showDetails ? (
        <div className="tool-details-panel">
          <div className="tool-details-block">
            <div className="tool-details-label">Tool Output Details</div>
            <pre className="tool-details-content">{JSON.stringify(detailsPayload, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

ToolOutputMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    attachments: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      kind: PropTypes.oneOf(['image', 'screenshot_request']).isRequired,
      source: PropTypes.oneOf(['user_included', 'camera_button', 'tool_result', 'replay']).isRequired,
      status: PropTypes.oneOf(['materializing', 'pending_capture', 'ready', 'failed']).isRequired,
    })),
    modelFacingToolOutput: PropTypes.string,
    toolOutputDetails: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
