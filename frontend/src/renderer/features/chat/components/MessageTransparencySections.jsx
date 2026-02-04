import PropTypes from 'prop-types';
import TransparencySection from './TransparencySection';

export default function MessageTransparencySections({ message }) {
  const sections = [];

  if (message.systemPrompt) {
    sections.push(
      <TransparencySection
        key="system-prompt"
        title="System Prompt"
        content={message.systemPrompt.content}
        metadata={null}
        type="system-prompt"
      />
    );
  }

  if (message.toolSchemas) {
    sections.push(
      <TransparencySection
        key="tool-schemas"
        title="Tool Schemas (Available Tools - Embedded in Initial User Message)"
        content={message.toolSchemas}
        type="json"
      />
    );
  }

  if (message.fullUserMessage) {
    const userMetadata = message.fullUserMessage.metadata || {};
    const metadataForDisplay = { ...userMetadata };

    sections.push(
      <TransparencySection
        key="user-message-full"
        title="Full Message Sent to Assistant (Complete)"
        content={message.fullUserMessage.content}
        metadata={metadataForDisplay}
        type="xml"
      />
    );
  }

  if (message.fullAssistantMessage) {
    sections.push(
      <TransparencySection
        key="assistant-message-full"
        title="Full Assistant Response"
        content={message.fullAssistantMessage.content}
        type="text"
      />
    );
  }

  if (sections.length === 0) {
    return null;
  }

  return <div className="transparency-sections">{sections}</div>;
}

MessageTransparencySections.propTypes = {
  message: PropTypes.shape({
    systemPrompt: PropTypes.shape({
      content: PropTypes.string,
      toolSchemas: PropTypes.any,
    }),
    toolSchemas: PropTypes.any,
    fullUserMessage: PropTypes.shape({
      content: PropTypes.string,
      metadata: PropTypes.object,
    }),
    fullAssistantMessage: PropTypes.shape({
      content: PropTypes.string,
    }),
  }).isRequired,
};
