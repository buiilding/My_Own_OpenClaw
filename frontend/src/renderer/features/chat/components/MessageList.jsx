/**
 * Provides the message list module for the renderer UI.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import messageShapePropType from './message/messageShapePropType';
import MessageItem from './message/MessageItem';
import { DesktopMessageListRuntime } from '../../../app/runtime/desktopMessageListRuntime';
import { DesktopMessageTransparencyRuntime } from '../../../app/runtime/desktopMessageTransparencyRuntime';
import { useMessageListAutoScroll } from '../hooks/useMessageListAutoScroll';
import { DesktopDevUiRuntime } from '../../../app/runtime/desktopDevUiRuntime';

const { isDevUiEnabled } = DesktopDevUiRuntime;

function MessageList({
  messages,
  conversationRef = null,
  thinkingStatus = null,
  thinkingSourceEventType = null,
  compactionDebugInfo = null,
  awaitingDotTargetMessageId = null,
  findQuery = '',
  messageFindMatchIndexesById = {},
  activeFindMatchIndex = null,
  enableAgentLoopAutoScroll = false,
  enableAssistantActions = false,
  enableUserActions = false,
  canRetryMessages = true,
  canEditMessages = true,
  disableAssistantActions = false,
  onAssistantFeedbackChange,
  onAssistantTryAgain,
  onUserEdit,
}) {
  const showDevCompactionDebug = isDevUiEnabled();
  const [editingUserMessageId, setEditingUserMessageId] = useState(null);
  const [editingUserReplayTargetMessageId, setEditingUserReplayTargetMessageId] = useState(null);
  const [editingUserDraft, setEditingUserDraft] = useState('');
  const [submittingUserEdit, setSubmittingUserEdit] = useState(false);
  const messagesEndRef = useRef(null);
  const {
    messageListRef,
    handleMessageListScroll,
  } = useMessageListAutoScroll({
    messages,
    conversationRef,
    awaitingDotTargetMessageId,
    enableAgentLoopAutoScroll,
  });

  const handleStartUserEdit = useCallback((messageId, messageText, editTargetMessageId = null) => {
    if (!canEditMessages || submittingUserEdit) {
      return;
    }
    setEditingUserMessageId(messageId);
    setEditingUserReplayTargetMessageId(editTargetMessageId || messageId);
    setEditingUserDraft(messageText || '');
  }, [canEditMessages, submittingUserEdit]);

  const handleCancelUserEdit = useCallback(() => {
    if (submittingUserEdit) {
      return;
    }
    setEditingUserMessageId(null);
    setEditingUserReplayTargetMessageId(null);
    setEditingUserDraft('');
  }, [submittingUserEdit]);

  const handleSubmitUserEdit = useCallback(async () => {
    if (submittingUserEdit || !editingUserMessageId || typeof onUserEdit !== 'function') {
      return;
    }
    const normalizedText = editingUserDraft.trim();
    if (!normalizedText) {
      return;
    }
    setSubmittingUserEdit(true);
    try {
      const result = await onUserEdit(
        editingUserReplayTargetMessageId || editingUserMessageId,
        normalizedText,
      );
      if (result !== false) {
        setEditingUserMessageId(null);
        setEditingUserReplayTargetMessageId(null);
        setEditingUserDraft('');
      }
    } finally {
      setSubmittingUserEdit(false);
    }
  }, [editingUserDraft, editingUserMessageId, editingUserReplayTargetMessageId, onUserEdit, submittingUserEdit]);

  useEffect(() => {
    if (!editingUserMessageId) {
      return;
    }
    const stillExists = messages.some((message) => message.id === editingUserMessageId);
    if (!stillExists) {
      setEditingUserMessageId(null);
      setEditingUserReplayTargetMessageId(null);
      setEditingUserDraft('');
      setSubmittingUserEdit(false);
    }
  }, [editingUserMessageId, messages]);

  useEffect(() => {
    if (activeFindMatchIndex === null || activeFindMatchIndex < 0) {
      return undefined;
    }

    return DesktopMessageListRuntime.scheduleActiveFindMatchScroll({
      messageListRef,
      activeFindMatchIndex,
    });
  }, [activeFindMatchIndex, messageListRef, messages]);

  const conversationToolSchemas = useMemo(
    () => DesktopMessageTransparencyRuntime.resolveConversationToolSchemas(messages),
    [messages],
  );

  const messageActionFlag = useCallback((message, key, fallback) => {
    const value = message?.actions?.[key];
    return typeof value === 'boolean' ? value : fallback;
  }, []);

  const renderedMessages = useMemo(
    () => messages.flatMap((msg) => {
      const canRetryMessage = canRetryMessages && messageActionFlag(msg, 'canRetry', true);
      const canEditMessage = canEditMessages && messageActionFlag(msg, 'canEdit', true);
      const nodes = [
        (
          <MessageItem
            key={msg.id}
            message={msg}
            conversationToolSchemas={conversationToolSchemas}
            findQuery={findQuery}
            findMatchIndexes={messageFindMatchIndexesById[msg.id] || []}
            activeFindMatchIndex={activeFindMatchIndex}
            enableAssistantActions={enableAssistantActions}
            enableUserActions={enableUserActions}
            disableAssistantActions={disableAssistantActions}
            canRetryMessage={canRetryMessage}
            canEditMessage={canEditMessage}
            onAssistantFeedbackChange={onAssistantFeedbackChange}
            onAssistantTryAgain={onAssistantTryAgain}
            isUserEditing={editingUserMessageId === msg.id}
            userEditDraft={editingUserDraft}
            isUserEditSubmitting={submittingUserEdit}
            onUserEditDraftChange={setEditingUserDraft}
            onStartUserEdit={canEditMessages ? handleStartUserEdit : null}
            onCancelUserEdit={handleCancelUserEdit}
            onSubmitUserEdit={handleSubmitUserEdit}
          />
        ),
      ];

      if (awaitingDotTargetMessageId && msg.id === awaitingDotTargetMessageId) {
        nodes.push(
          <div
            key={`${msg.id}__awaiting`}
            className="message-list-awaiting-dot message-list-awaiting-dot-inline"
            role="status"
            aria-live="polite"
            aria-label="Assistant is preparing response"
          >
            <span className="message-list-awaiting-dot-indicator" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>,
        );
      }

      return nodes;
    }),
    [
      messages,
      conversationToolSchemas,
      findQuery,
      messageFindMatchIndexesById,
      activeFindMatchIndex,
      awaitingDotTargetMessageId,
      enableAssistantActions,
      enableUserActions,
      canRetryMessages,
      canEditMessages,
      disableAssistantActions,
      messageActionFlag,
      onAssistantFeedbackChange,
      onAssistantTryAgain,
      editingUserMessageId,
      editingUserDraft,
      submittingUserEdit,
      handleStartUserEdit,
      handleCancelUserEdit,
      handleSubmitUserEdit,
    ]
  );

  const compactionStatusText = useMemo(() => {
    return DesktopMessageListRuntime.resolveCompactionStatusText(
      thinkingStatus,
      thinkingSourceEventType,
    );
  }, [thinkingSourceEventType, thinkingStatus]);
  const showCompactionDebugDetails = showDevCompactionDebug
    && compactionDebugInfo
    && !compactionDebugInfo.skippedReason
    && Array.isArray(compactionDebugInfo.replacementHistoryPreview)
    && compactionDebugInfo.replacementHistoryPreview.length > 0;

  return (
    <div
      className="message-list"
      ref={messageListRef}
      onScroll={handleMessageListScroll}
    >
      {renderedMessages}
      {compactionStatusText ? (
        <div
          className={`message-list-compaction-status compaction-state-${compactionStatusText.state}`}
          role="status"
          aria-live="polite"
          aria-label={compactionStatusText.ariaLabel}
        >
          <span
            className={`message-list-compaction-indicator compaction-state-${compactionStatusText.state}`}
            aria-hidden="true"
          />
          <span className={`message-list-compaction-text compaction-state-${compactionStatusText.state}`}>
            {compactionStatusText.text}
          </span>
        </div>
      ) : null}
      {showCompactionDebugDetails ? (
        <details className="message-list-compaction-debug" open>
          <summary>Compacted History Summary</summary>
          <div className="message-list-compaction-debug-metadata">
            <div><strong>Strategy:</strong> {compactionDebugInfo.strategy || 'unknown'}</div>
            <div><strong>Reason:</strong> {compactionDebugInfo.reason || 'unknown'}</div>
            <div><strong>Before tokens:</strong> {compactionDebugInfo.beforeTokens ?? 'unknown'}</div>
            <div><strong>After tokens:</strong> {compactionDebugInfo.afterTokens ?? 'unknown'}</div>
            <div><strong>Removed messages:</strong> {compactionDebugInfo.removedMessages ?? 'unknown'}</div>
            {compactionDebugInfo.skippedReason ? (
              <div><strong>Skipped reason:</strong> {compactionDebugInfo.skippedReason}</div>
            ) : null}
          </div>
          <div className="message-list-compaction-debug-section">
            <div className="message-list-compaction-debug-section-title">Replacement History</div>
            {compactionDebugInfo.replacementHistoryPreview?.length ? (
              <div className="message-list-compaction-debug-history">
                {compactionDebugInfo.replacementHistoryPreview.map((entry, index) => (
                  <div
                    key={`${entry.role || 'unknown'}:${entry.messageType || 'unknown'}:${entry.toolCallId || index}`}
                    className="message-list-compaction-debug-entry"
                  >
                    <div className="message-list-compaction-debug-entry-header">
                      <span><strong>#{index + 1}</strong></span>
                      <span><strong>Role:</strong> {entry.role || 'unknown'}</span>
                      <span><strong>Type:</strong> {entry.messageType || 'unknown'}</span>
                      {entry.toolName ? <span><strong>Tool:</strong> {entry.toolName}</span> : null}
                      {entry.toolCallId ? <span><strong>Tool call id:</strong> {entry.toolCallId}</span> : null}
                    </div>
                    <pre className="message-list-compaction-debug-entry-content">
                      {entry.content || '(no content)'}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="message-list-compaction-debug-empty">No replacement history preview.</div>
            )}
          </div>
        </details>
      ) : null}
      <div ref={messagesEndRef} data-testid="message-list-end" />
    </div>
  );
}

MessageList.propTypes = {
  messages: PropTypes.arrayOf(messageShapePropType).isRequired,
  conversationRef: PropTypes.string,
  thinkingStatus: PropTypes.string,
  thinkingSourceEventType: PropTypes.string,
  compactionDebugInfo: PropTypes.shape({
    reason: PropTypes.string,
    strategy: PropTypes.string,
    beforeTokens: PropTypes.number,
    afterTokens: PropTypes.number,
    removedMessages: PropTypes.number,
    summaryPreview: PropTypes.string,
    summaryText: PropTypes.string,
    replacementHistoryPreview: PropTypes.arrayOf(PropTypes.shape({
      role: PropTypes.string,
      messageType: PropTypes.string,
      content: PropTypes.string,
      toolName: PropTypes.string,
      toolCallId: PropTypes.string,
    })),
    skippedReason: PropTypes.string,
  }),
  awaitingDotTargetMessageId: PropTypes.string,
  findQuery: PropTypes.string,
  messageFindMatchIndexesById: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.number)),
  activeFindMatchIndex: PropTypes.number,
  enableAgentLoopAutoScroll: PropTypes.bool,
  enableAssistantActions: PropTypes.bool,
  enableUserActions: PropTypes.bool,
  canRetryMessages: PropTypes.bool,
  canEditMessages: PropTypes.bool,
  disableAssistantActions: PropTypes.bool,
  onAssistantFeedbackChange: PropTypes.func,
  onAssistantTryAgain: PropTypes.func,
  onUserEdit: PropTypes.func,
};

export default MessageList;
