import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { type ChatMessage } from '../../stores/chatStore';
import {
  buildScreenshotAttachment,
  buildScreenshotAttachments,
} from '../../utils/chatStream/chatStreamEventUtils';
import { GENERIC_THINKING_STATUS } from '../../utils/chatStream/chatStreamThinkingStatus';
import type { ChatStreamThinkingStateDeps } from './chatStreamHandlerTypes';

type UseChatStreamLocalUserHandlerDeps = ChatStreamThinkingStateDeps<'local-user-message'>;

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function resolveUserMessageId(event: ConversationEvent): string {
  return readString(event.payload?.messageId)
    ?? readString(event.payload?.message_id)
    ?? readString(event.payload?.id)
    ?? event.turnRef
    ?? event.eventId
    ?? crypto.randomUUID();
}

export function useChatStreamLocalUserHandler({
  addMessage,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamLocalUserHandlerDeps) {
  return useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (event.type !== 'user_message') {
      return;
    }
    const text = readString(event.payload?.text) ?? readString(event.payload?.content);
    if (!text) {
      return;
    }
    const screenshotRefs = readStringArray(event.payload?.screenshotRefs);
    const attachmentFilenames = readStringArray(event.payload?.attachmentFilenames);
    const screenshotAttachments = buildScreenshotAttachments(
      screenshotRefs.length > 0
        ? screenshotRefs
        : [readString(event.payload?.screenshotRef)],
      readString(event.payload?.screenshotUrl),
    );
    const firstScreenshotAttachment = screenshotAttachments[0] || buildScreenshotAttachment(
      readString(event.payload?.screenshotRef),
      readString(event.payload?.screenshotUrl),
    );
    const newMessage: ChatMessage = {
      id: resolveUserMessageId(event),
      text,
      sender: 'user',
      sourceEventType: 'local-user-message',
      sourceChannel: 'windie:conversation-event',
      attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
      screenshotRef: firstScreenshotAttachment.screenshotRef,
      screenshotUrl: firstScreenshotAttachment.screenshotUrl,
      screenshots: screenshotAttachments.length > 0
        ? screenshotAttachments.map((attachment) => ({
          screenshotRef: attachment.screenshotRef,
          screenshotUrl: attachment.screenshotUrl,
        }))
        : null,
      timestamp: readString(event.payload?.timestamp) ?? event.timestamp,
      turnRef: event.turnRef ?? undefined,
    };
    addMessage(newMessage, conversationRef);
    setIsSending(true, conversationRef);
    const modelContext = modelContextRef.current;
    if (modelContext.supportsThinking && !modelContext.supportsThinkingTextStream) {
      setThinkingStatus(GENERIC_THINKING_STATUS, conversationRef);
      setThinkingSourceEventType('local-user-message', conversationRef);
    } else {
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
    }

    recordTrackingEvent('local-user-message', event.turnRef, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    }, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
}
