/**
 * Provides the message content module for the renderer UI.
 */

import PropTypes from 'prop-types';
import { isUserMessageWithScreenshot } from '../utils/message/messageScreenshots';
import AssistantThinkingSection from './message/content/AssistantThinkingSection';
import ErrorMessage from './message/content/ErrorMessage';
import MarkdownMessage from './message/content/MarkdownMessage';
import ToolActionsSummaryMessage from './message/content/ToolActionsSummaryMessage';
import ToolCallMessage from './message/content/ToolCallMessage';
import ToolExplanationMessage from './message/content/ToolExplanationMessage';
import ToolOutputMessage from './message/content/ToolOutputMessage';
import UserMessage from './message/content/UserMessage';

export default function MessageContent({
  message,
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  if (message.type === 'error') {
    return (
      <ErrorMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (message.type === 'tool-output') {
    return (
      <ToolOutputMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (message.type === 'tool-call') {
    return (
      <ToolCallMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (message.type === 'tool-explanation' || message.type === 'search-source') {
    return (
      <ToolExplanationMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (message.type === 'tool-actions-summary') {
    return <ToolActionsSummaryMessage message={message} />;
  }

  if (isUserMessageWithScreenshot(message)) {
    return (
      <UserMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (message.sender === 'assistant' && (!message.type || message.type === 'llm-text')) {
    const hasVisibleAssistantText = typeof message.text === 'string' && message.text.trim().length > 0;
    return (
      <div className="assistant-message-content">
        <AssistantThinkingSection
          thinkingText={message.thinkingText || ''}
          sourceEventType={message.thinkingSourceEventType || null}
        />
        {hasVisibleAssistantText ? (
          <MarkdownMessage
            text={message.text}
            sender={message.sender}
            findQuery={findQuery}
            findMatchIndexes={findMatchIndexes}
            activeFindMatchIndex={activeFindMatchIndex}
          />
        ) : null}
      </div>
    );
  }

  return (
    <MarkdownMessage
      text={message.text}
      sender={message.sender}
      findQuery={findQuery}
      findMatchIndexes={findMatchIndexes}
      activeFindMatchIndex={activeFindMatchIndex}
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
    toolCallDisplayText: PropTypes.string,
    modelFacingToolOutput: PropTypes.string,
    toolCallDetails: PropTypes.object,
    toolOutputDetails: PropTypes.object,
    actionExplanations: PropTypes.arrayOf(PropTypes.string),
    toolMetadata: PropTypes.object,
    toolName: PropTypes.string,
    executionTime: PropTypes.number,
    success: PropTypes.bool,
    modelProvider: PropTypes.string,
    modelId: PropTypes.string,
    thinkingText: PropTypes.string,
    thinkingSourceEventType: PropTypes.string,
  }).isRequired,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
