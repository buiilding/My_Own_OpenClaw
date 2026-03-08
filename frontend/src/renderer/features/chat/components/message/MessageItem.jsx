import { memo } from 'react';
import PropTypes from 'prop-types';
import MessageContent from '../MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import AssistantMessageActions from './AssistantMessageActions';
import UserMessageActions from './UserMessageActions';
import MessageSourceBadge from './MessageSourceBadge';
import UserMessageEditComposer from './UserMessageEditComposer';
import messageShapePropType from './messageShapePropType';
import { buildMessageClassName } from '../../utils/message/messageListClasses';
import {
  shouldRenderAssistantActions,
  shouldRenderUserActions,
} from '../../utils/message/messageListState';


const MessageItem = memo(function MessageItem({
  message,
  conversationToolSchemas,
  enableAssistantActions,
  enableUserActions,
  disableAssistantActions,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  isUserEditing,
  userEditDraft,
  onUserEditDraftChange,
  onStartUserEdit,
  onCancelUserEdit,
  onSubmitUserEdit,
}) {
  const messageClass = buildMessageClassName(message);
  const showUserEditComposer = shouldRenderUserActions(message, enableUserActions) && isUserEditing;

  return (
    <div className={messageClass}>
      {showUserEditComposer ? (
        <UserMessageEditComposer
          value={userEditDraft}
          onChange={onUserEditDraftChange}
          onCancel={onCancelUserEdit}
          onSubmit={onSubmitUserEdit}
        />
      ) : (
        <MessageContent message={message} />
      )}
      <MessageSourceBadge message={message} />
      {shouldRenderAssistantActions(message, enableAssistantActions) ? (
        <AssistantMessageActions
          messageId={message.id}
          messageText={message.text}
          feedback={message.feedback ?? null}
          disabled={disableAssistantActions}
          onFeedbackChange={onAssistantFeedbackChange}
          onTryAgain={onAssistantTryAgain}
        />
      ) : null}
      {shouldRenderUserActions(message, enableUserActions) && !showUserEditComposer ? (
        <UserMessageActions
          messageId={message.id}
          messageText={message.text}
          onEdit={onStartUserEdit}
        />
      ) : null}
      <MessageTransparencySections
        message={message}
        conversationToolSchemas={conversationToolSchemas}
      />
    </div>
  );
});

MessageItem.propTypes = {
  message: messageShapePropType.isRequired,
  conversationToolSchemas: PropTypes.any,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  isUserEditing: PropTypes.bool,
  userEditDraft: PropTypes.string,
  onUserEditDraftChange: PropTypes.func,
  onStartUserEdit: PropTypes.func,
  onCancelUserEdit: PropTypes.func,
  onSubmitUserEdit: PropTypes.func,
};

export default MessageItem;
