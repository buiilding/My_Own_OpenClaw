import PropTypes from 'prop-types';
import { isUserMessageWithScreenshot } from '../utils/message/messageScreenshots';
import AssistantThinkingSection from './message/content/AssistantThinkingSection';
import ErrorMessage from './message/content/ErrorMessage';
import MarkdownMessage from './message/content/MarkdownMessage';
import ToolCallMessage from './message/content/ToolCallMessage';
import ToolOutputMessage from './message/content/ToolOutputMessage';
import UserMessage from './message/content/UserMessage';

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
            modelProvider={message.modelProvider || null}
            modelId={message.modelId || null}
          />
        ) : null}
      </div>
    );
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
    thinkingText: PropTypes.string,
    thinkingSourceEventType: PropTypes.string,
  }).isRequired,
};
