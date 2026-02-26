import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { isUserMessageWithScreenshot, resolveMessageScreenshotSrc } from '../utils/messageScreenshots';

function MarkdownMessage({
  text,
  sender = 'assistant',
  modelProvider = null,
  modelId = null,
}) {
  const contract = useMemo(
    () => resolveLlmOutputContract(text ?? '', {
      provider: sender === 'assistant' ? modelProvider : null,
      modelId: sender === 'assistant' ? modelId : null,
      enableMath: sender === 'assistant',
      stripAccidentalHtmlTokens: sender === 'assistant',
    }),
    [text, sender, modelProvider, modelId],
  );
  const html = useMemo(
    () => toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled }),
    [contract.markdown, contract.mathEnabled],
  );
  return (
    <div
      className="message-content message-content-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

MarkdownMessage.propTypes = {
  text: PropTypes.string,
  sender: PropTypes.oneOf(['user', 'assistant']),
  modelProvider: PropTypes.string,
  modelId: PropTypes.string,
};

function ToolOutputMessage({ message }) {
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
      <pre className="tool-output-content">{modelFacingOutput}</pre>
      {screenshotSrc && (
        <div className="tool-screenshot-container">
          <div className="tool-screenshot-header">📸 Screenshot After Action</div>
          <img
            src={screenshotSrc}
            alt="Screenshot after tool execution"
            className="tool-screenshot-image"
            loading="lazy"
          />
        </div>
      )}
      {showDetails && (
        <div className="tool-details-panel">
          <div className="tool-details-block">
            <div className="tool-details-label">Tool Output Details</div>
            <pre className="tool-details-content">{JSON.stringify(detailsPayload, null, 2)}</pre>
          </div>
        </div>
      )}
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
};

function ToolCallMessage({ message }) {
  const [showDetails, setShowDetails] = useState(false);
  const modelFacingCall = (
    message.modelFacingToolCall
    && typeof message.modelFacingToolCall === 'object'
    && !Array.isArray(message.modelFacingToolCall)
  )
    ? message.modelFacingToolCall
    : null;
  const modelFacingText = modelFacingCall
    ? JSON.stringify(modelFacingCall, null, 2)
    : message.text;
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
      {showDetails && (
        <div className="tool-details-panel">
          <div className="tool-details-block">
            <div className="tool-details-label">Tool Call Details</div>
            <pre className="tool-details-content">{JSON.stringify(detailsPayload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

ToolCallMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    modelFacingToolCall: PropTypes.object,
    toolCallDetails: PropTypes.object,
  }).isRequired,
};

function ErrorMessage({ message }) {
  return (
    <div className="error-message-container">
      <div className="error-header">⚠️ Error</div>
      <div className="error-content">{message.text}</div>
    </div>
  );
}

ErrorMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
  }).isRequired,
};

function UserMessage({ message }) {
  const screenshotSrc = resolveMessageScreenshotSrc(message);
  return (
    <div className="user-message-container">
      {screenshotSrc && (
        <div className="user-screenshot-container">
          <img
            src={screenshotSrc}
            alt="User message screenshot"
            className="user-screenshot-image"
            loading="lazy"
          />
        </div>
      )}
      <MarkdownMessage text={message.text} sender="user" />
    </div>
  );
}

UserMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
  }).isRequired,
};

export default function MessageContent({ message }) {
  if (message.type === 'error') {
    return <ErrorMessage message={message} />;
  }

  if (message.type === 'tool-output') {
    return <ToolOutputMessage message={message} />;
  }

  if (message.type === 'tool-call') {
    return <ToolCallMessage message={message} />;
  }

  if (isUserMessageWithScreenshot(message)) {
    return <UserMessage message={message} />;
  }

  return (
    <MarkdownMessage
      text={message.text}
      sender={message.sender}
      modelProvider={message.modelProvider || null}
      modelId={message.modelId || null}
    />
  );
}

MessageContent.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
    type: PropTypes.string,
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
    modelFacingToolCall: PropTypes.object,
    modelFacingToolOutput: PropTypes.string,
    toolCallDetails: PropTypes.object,
    toolOutputDetails: PropTypes.object,
    toolMetadata: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
    modelProvider: PropTypes.string,
    modelId: PropTypes.string,
  }).isRequired,
};
