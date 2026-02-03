import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import ThinkingDisplay from './ThinkingDisplay';
import TransparencySection from './TransparencySection';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import '../../../styles/ThinkingDisplay.css';

function MessageList({ messages, thinkingStatus }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingStatus]);

  const renderMarkdownMessage = (text) => {
    const html = toSanitizedMarkdownHtml(text ?? '');
    return (
      <div
        className="message-content message-content-markdown"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  const renderMessageContent = (msg) => {
    const isToolOutput = msg.type === 'tool-output';
    const isToolCall = msg.type === 'tool-call';
    const isError = msg.type === 'error';

    if (isError) {
      return (
        <div className="error-message-container">
          <div className="error-header">⚠️ Error</div>
          <div className="error-content">{msg.text}</div>
        </div>
      );
    }

    if (isToolOutput) {
      return (
        <div className="tool-output-container">
          <div className="tool-output-header">📤 Tool Output</div>
          <pre className="tool-output-content">{msg.text}</pre>
          {msg.screenshot && (
            <div className="tool-screenshot-container">
              <div className="tool-screenshot-header">📸 Screenshot After Action</div>
              <img
                src={`data:image/png;base64,${msg.screenshot}`}
                alt="Screenshot after tool execution"
                className="tool-screenshot-image"
                loading="lazy"
              />
            </div>
          )}
          {msg.toolMetadata && (
            <TransparencySection
              title="Execution Details"
              content={msg.text}
              metadata={{
                'Tool Name': msg.toolName || 'Unknown',
                'Execution Time': msg.executionTime ? `${msg.executionTime.toFixed(3)}s` : 'N/A',
                'Success': msg.success ? 'Yes' : 'No',
                'Active Window': msg.toolMetadata?.active_window || 'Unknown',
              }}
              type="text"
            />
          )}
        </div>
      );
    }

    if (isToolCall) {
      return (
        <div className="tool-call-container">
          <div className="tool-call-header">🔧 Tool Call</div>
          <pre className="tool-call-content">{msg.text}</pre>
        </div>
      );
    }

    // User messages with screenshots
    if (msg.sender === 'user' && msg.screenshot) {
      return (
        <div className="user-message-container">
          {renderMarkdownMessage(msg.text)}
          <div className="user-screenshot-container">
            <div className="user-screenshot-header">📸 Screenshot</div>
            <img
              src={`data:image/png;base64,${msg.screenshot}`}
              alt="User message screenshot"
              className="user-screenshot-image"
              loading="lazy"
            />
          </div>
        </div>
      );
    }

    return renderMarkdownMessage(msg.text);
  };

  const renderTransparencySections = (msg) => {
    const sections = [];

    // System Prompt (always shown, tool schemas are embedded in the first user message)
    if (msg.systemPrompt) {
      sections.push(
        <TransparencySection
          key="system-prompt"
          title="System Prompt"
          content={msg.systemPrompt.content}
          metadata={null}
          type="system-prompt"
        />
      );
    }

    // Tool Schemas - Shown for transparency (embedded in initial user message)
    if (msg.toolSchemas) {
      sections.push(
        <TransparencySection
          key="tool-schemas"
          title="Tool Schemas (Available Tools - Embedded in Initial User Message)"
          content={msg.toolSchemas}
          type="json"
        />
      );
    }

    // User Message Full - Show complete message sent to assistant
    // Tool schemas are embedded in the first user message only
    if (msg.fullUserMessage) {
      const userMetadata = msg.fullUserMessage.metadata || {};
      const metadataForDisplay = { ...userMetadata };

      sections.push(
        <TransparencySection
          key="user-message-full"
          title="Full Message Sent to Assistant (Complete)"
          content={msg.fullUserMessage.content}
          metadata={metadataForDisplay}
          type="xml" // Use xml type for better formatting
        />
      );
    }

    // Assistant Message Full
    if (msg.fullAssistantMessage) {
      sections.push(
        <TransparencySection
          key="assistant-message-full"
          title="Full Assistant Response"
          content={msg.fullAssistantMessage.content}
          type="text"
        />
      );
    }

    return sections.length > 0 ? <div className="transparency-sections">{sections}</div> : null;
  };

  return (
    <div className="message-list">
      {messages.map((msg) => {
        const messageClass = `message message-${msg.sender} ${
          msg.sender === 'assistant' && msg.isComplete === false ? 'message-streaming' : ''
        } ${msg.type ? `message-type-${msg.type}` : ''} ${msg.screenshot ? 'message-has-screenshot' : ''}`;
        return (
          <div key={msg.id} className={messageClass}>
            {renderMessageContent(msg)}
            {renderTransparencySections(msg)}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
      <ThinkingDisplay status={thinkingStatus} />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
      isComplete: PropTypes.bool,
      type: PropTypes.string,
      screenshot: PropTypes.string,
    })
  ).isRequired,
  thinkingStatus: PropTypes.string,
};

export default MessageList;
