import PropTypes from 'prop-types';
import TransparencySection from './TransparencySection';
import { buildTransparencySectionConfigs } from '../../utils/message/messageTransparency';
import { isDevUiEnabled } from '../../utils/devUiFlag';
import { toolSchemaListPropType } from './toolSchemaPropType';

export default function MessageTransparencySections({ message, conversationToolSchemas = null }) {
  if (!isDevUiEnabled()) {
    return null;
  }

  const sections = buildTransparencySectionConfigs(message, {
    conversationToolSchemas,
  });

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="transparency-sections">
      {sections.map((section) => (
        <TransparencySection
          key={section.key}
          title={section.title}
          content={section.content}
          metadata={section.metadata}
          type={section.type}
        />
      ))}
    </div>
  );
}

MessageTransparencySections.propTypes = {
  message: PropTypes.shape({
    sender: PropTypes.oneOf(['user', 'assistant']),
    systemPrompt: PropTypes.shape({
      content: PropTypes.string,
      toolSchemas: toolSchemaListPropType,
    }),
    toolSchemas: toolSchemaListPropType,
    fullUserMessage: PropTypes.shape({
      content: PropTypes.string,
      metadata: PropTypes.object,
    }),
    fullAssistantMessage: PropTypes.shape({
      content: PropTypes.string,
    }),
  }).isRequired,
  conversationToolSchemas: toolSchemaListPropType,
};
