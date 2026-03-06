import PropTypes from 'prop-types';
import { isDevUiEnabled } from '../../utils/devUiFlag';
import { resolveMessageTokenUsageTag } from '../../utils/messageTokenUsage';
import { resolveSourceTag } from '../../utils/sourceTags';

export default function MessageSourceBadge({ message }) {
  if (!isDevUiEnabled()) {
    return null;
  }

  const sourceEventType = typeof message?.sourceEventType === 'string' && message.sourceEventType
    ? message.sourceEventType
    : 'transcript';
  const sourceChannel = typeof message?.sourceChannel === 'string' && message.sourceChannel
    ? message.sourceChannel
    : 'unknown';
  const tokenUsageTag = resolveMessageTokenUsageTag(message);
  const sourceTag = resolveSourceTag(sourceEventType, sourceChannel);
  const badgeText = tokenUsageTag
    ? `${sourceTag} · ${tokenUsageTag}`
    : sourceTag;

  return (
    <div className="message-source-badge" title={`source_event=${sourceEventType}`}>
      {badgeText}
    </div>
  );
}

MessageSourceBadge.propTypes = {
  message: PropTypes.shape({
    sourceEventType: PropTypes.string,
    sourceChannel: PropTypes.string,
  }).isRequired,
};
