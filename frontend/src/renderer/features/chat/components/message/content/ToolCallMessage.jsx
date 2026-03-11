import { useState } from 'react';
import PropTypes from 'prop-types';

export default function ToolCallMessage({ message }) {
  const [showDetails, setShowDetails] = useState(false);
  const modelFacingText = typeof message.toolCallDisplayText === 'string' && message.toolCallDisplayText.trim()
    ? message.toolCallDisplayText
    : (
      message.modelFacingToolCall
      && typeof message.modelFacingToolCall === 'object'
      && !Array.isArray(message.modelFacingToolCall)
    )
      ? JSON.stringify(message.modelFacingToolCall, null, 2)
      : '';
  const detailsPayload = (
    message.toolCallDetails
    && typeof message.toolCallDetails === 'object'
    && !Array.isArray(message.toolCallDetails)
  )
    ? message.toolCallDetails
    : { raw_message_text: message.text };

  return (
    <div className="tool-call-container">
      <div className="tool-card-header-row">
        <div className="tool-call-header">🔧 Tool Call</div>
        <button
          type="button"
          className="tool-details-btn"
          onClick={() => setShowDetails((previous) => !previous)}
        >
          Details
        </button>
      </div>
      <pre className="tool-call-content">{modelFacingText}</pre>
      {showDetails ? (
        <div className="tool-details-panel">
          <div className="tool-details-block">
            <div className="tool-details-label">Tool Call Details</div>
            <pre className="tool-details-content">{JSON.stringify(detailsPayload, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

ToolCallMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    toolCallDisplayText: PropTypes.string,
    modelFacingToolCall: PropTypes.object,
    toolCallDetails: PropTypes.object,
  }).isRequired,
};
