import { useMemo } from 'react';
import PropTypes from 'prop-types';
import TransparencySection from './TransparencySection';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';

function resolveInlineScreenshotContentType(contentType) {
  const normalized = (contentType || '').toLowerCase();
  if (normalized.includes('png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

function resolveMessageScreenshotSrc(message) {
  if (message.screenshotUrl) {
    return message.screenshotUrl;
  }
  if (message.screenshot) {
    const contentType = resolveInlineScreenshotContentType(message.screenshotContentType);
    return `data:${contentType};base64,${message.screenshot}`;
  }
  return null;
}

function MarkdownMessage({ text }) {
  const html = useMemo(() => toSanitizedMarkdownHtml(text ?? ''), [text]);
  return (
    <div
      className="message-content message-content-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

MarkdownMessage.propTypes = {
  text: PropTypes.string,
};

function ToolOutputMessage({ message }) {
  const screenshotSrc = resolveMessageScreenshotSrc(message);
  return (
    <div className="tool-output-container">
      <div className="tool-output-header">📤 Tool Output</div>
      <pre className="tool-output-content">{message.text}</pre>
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
      {message.toolMetadata && (
        <TransparencySection
          title="Execution Details"
          content={message.text}
          metadata={{
            'Tool Name': message.toolName || 'Unknown',
            'Execution Time': message.executionTime ? `${message.executionTime.toFixed(3)}s` : 'N/A',
            'Success': message.success ? 'Yes' : 'No',
            'Active Window': message.toolMetadata?.active_window || 'Unknown',
          }}
          type="text"
        />
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
    toolMetadata: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
  }).isRequired,
};

function ToolCallMessage({ message }) {
  return (
    <div className="tool-call-container">
      <div className="tool-call-header">🔧 Tool Call</div>
      <pre className="tool-call-content">{message.text}</pre>
    </div>
  );
}

ToolCallMessage.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
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
      <MarkdownMessage text={message.text} />
      {screenshotSrc && (
        <div className="user-screenshot-container">
          <div className="user-screenshot-header">📸 Screenshot</div>
          <img
            src={screenshotSrc}
            alt="User message screenshot"
            className="user-screenshot-image"
            loading="lazy"
          />
        </div>
      )}
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

  if (message.sender === 'user' && (message.screenshotUrl || message.screenshotRef || message.screenshot)) {
    return <UserMessage message={message} />;
  }

  return <MarkdownMessage text={message.text} />;
}

MessageContent.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
    type: PropTypes.string,
    screenshot: PropTypes.string,
    screenshotUrl: PropTypes.string,
    screenshotContentType: PropTypes.string,
    toolMetadata: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
  }).isRequired,
};
