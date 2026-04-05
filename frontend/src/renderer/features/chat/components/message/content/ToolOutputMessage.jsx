import { useState } from 'react';
import PropTypes from 'prop-types';
import { resolveMessageScreenshotSrc } from '../../../utils/message/messageScreenshots';
import HighlightedPlainText from './HighlightedPlainText';

export default function ToolOutputMessage({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const [showDetails, setShowDetails] = useState(false);
  const screenshotSrc = resolveMessageScreenshotSrc(message);
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
    : {
      tool_name: message.toolName || null,
      execution_time: message.executionTime ?? null,
      success: message.success ?? null,
      metadata: message.toolMetadata || null,
    };

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
      {screenshotSrc ? (
        <div className="tool-screenshot-container">
          <div className="tool-screenshot-header">📸 Screenshot After Action</div>
          <img
            src={screenshotSrc}
            alt="Screenshot after tool execution"
            className="tool-screenshot-image"
            loading="lazy"
          />
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
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
    modelFacingToolOutput: PropTypes.string,
    toolOutputDetails: PropTypes.object,
    toolMetadata: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
