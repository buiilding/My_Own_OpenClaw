/**
 * Provides the message item module for the renderer UI.
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import MessageContent from '../MessageContent';
import MessageTransparencySections from './MessageTransparencySections';
import AssistantMessageActions from './AssistantMessageActions';
import UserMessageActions from './UserMessageActions';
import MessageSourceBadge from './MessageSourceBadge';
import UserMessageEditComposer from './UserMessageEditComposer';
import messageShapePropType from './messageShapePropType';
import { DesktopMessageClassRuntime } from '../../../../app/runtime/desktopMessageClassRuntime';
import { DesktopMessageListRuntime } from '../../../../app/runtime/desktopMessageListRuntime';


const MessageItem = memo(function MessageItem({
  message,
  conversationToolSchemas,
  findQuery,
  findMatchIndexes,
  activeFindMatchIndex,
  enableAssistantActions,
  enableUserActions,
  disableAssistantActions,
  canRetryMessage = false,
  canEditMessage = false,
  assistantRetryTargetMessageId = null,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  isUserEditing,
  userEditDraft,
  isUserEditSubmitting,
  onUserEditDraftChange,
  userEditTargetMessageId = null,
  onStartUserEdit,
  onCancelUserEdit,
  onSubmitUserEdit,
}) {
  const messageClass = DesktopMessageClassRuntime.buildMessageClassName(message);
  const showUserEditComposer = DesktopMessageListRuntime.shouldRenderUserActions(
    message,
    enableUserActions,
  ) && isUserEditing;
  const showAssistantActions = DesktopMessageListRuntime.shouldRenderAssistantActions(
    message,
    enableAssistantActions,
  );
  const showUserActions = DesktopMessageListRuntime.shouldRenderUserActions(
    message,
    enableUserActions,
  ) && !showUserEditComposer;

  return (
    <div className={messageClass}>
      {showUserEditComposer ? (
        <UserMessageEditComposer
          value={userEditDraft}
          onChange={onUserEditDraftChange}
          onCancel={onCancelUserEdit}
          onSubmit={onSubmitUserEdit}
          isSubmitting={isUserEditSubmitting}
        />
      ) : (
        <MessageContent
          message={message}
          findQuery={findQuery}
          findMatchIndexes={findMatchIndexes}
          activeFindMatchIndex={activeFindMatchIndex}
        />
      )}
      <MessageSourceBadge message={message} />
      {showAssistantActions ? (
        <AssistantMessageActions
          messageId={message.id}
          messageText={message.text}
          feedback={message.feedback ?? null}
          disabled={disableAssistantActions}
          visible={!disableAssistantActions}
          canTryAgain={canRetryMessage}
          retryTargetMessageId={assistantRetryTargetMessageId}
          onFeedbackChange={onAssistantFeedbackChange}
          onTryAgain={onAssistantTryAgain}
        />
      ) : null}
      {showUserActions ? (
        <UserMessageActions
          messageId={message.id}
          messageText={message.text}
          canEdit={canEditMessage}
          editTargetMessageId={userEditTargetMessageId}
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
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  canRetryMessage: PropTypes.bool,
  canEditMessage: PropTypes.bool,
  assistantRetryTargetMessageId: PropTypes.string,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  isUserEditing: PropTypes.bool,
  userEditDraft: PropTypes.string,
  isUserEditSubmitting: PropTypes.bool,
  onUserEditDraftChange: PropTypes.func,
  userEditTargetMessageId: PropTypes.string,
  onStartUserEdit: PropTypes.func,
  onCancelUserEdit: PropTypes.func,
  onSubmitUserEdit: PropTypes.func,
};

export default MessageItem;
