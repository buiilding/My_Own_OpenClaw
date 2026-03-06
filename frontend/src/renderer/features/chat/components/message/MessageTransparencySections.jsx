import PropTypes from 'prop-types';
import TransparencySection from './TransparencySection';
import { buildTransparencySectionConfigs } from '../../utils/messageTransparency';
import { isDevUiEnabled } from '../../utils/devUiFlag';

export default function MessageTransparencySections({ message }) {
  if (!isDevUiEnabled()) {
    return null;
  }

  const sections = buildTransparencySectionConfigs(message);

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
