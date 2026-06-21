/**
 * Provides the message content module for the renderer UI.
 */

import PropTypes from 'prop-types';
import {
  isAssistantResponseMessageContentPresentation,
  isErrorMessageContentPresentation,
  isToolActionsSummaryMessageContentPresentation,
  isToolCallMessageContentPresentation,
  isToolExplanationMessageContentPresentation,
  isToolOutputMessageContentPresentation,
  isUserScreenshotMessageContentPresentation,
  resolveMessageContentPresentation,
} from '../../../app/runtime/desktopMessageContentRuntime';
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
  const contentPresentation = resolveMessageContentPresentation(message);

  if (isErrorMessageContentPresentation(contentPresentation)) {
    return (
      <ErrorMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (isToolOutputMessageContentPresentation(contentPresentation)) {
    return (
      <ToolOutputMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (isToolCallMessageContentPresentation(contentPresentation)) {
    return (
      <ToolCallMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (isToolExplanationMessageContentPresentation(contentPresentation)) {
    return (
      <ToolExplanationMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (isToolActionsSummaryMessageContentPresentation(contentPresentation)) {
    return <ToolActionsSummaryMessage message={message} />;
  }

  if (isUserScreenshotMessageContentPresentation(contentPresentation)) {
    return (
      <UserMessage
        message={message}
        findQuery={findQuery}
        findMatchIndexes={findMatchIndexes}
        activeFindMatchIndex={activeFindMatchIndex}
      />
    );
  }

  if (isAssistantResponseMessageContentPresentation(contentPresentation)) {
    return (
      <div className="assistant-message-content">
        <AssistantThinkingSection
          thinkingText={message.thinkingText || ''}
          sourceEventType={message.thinkingSourceEventType || null}
        />
        {contentPresentation.hasVisibleAssistantText ? (
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
