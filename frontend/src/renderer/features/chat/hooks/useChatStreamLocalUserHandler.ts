import { useCallback } from 'react';
import type { LocalUserMessageEvent } from '../../../types/backendEvents';
import { type ChatMessage } from '../stores/chatStore';
import {
  buildScreenshotAttachment,
  buildScreenshotAttachments,
} from '../utils/chatStreamEventUtils';
import { GENERIC_THINKING_STATUS } from '../utils/chatStreamThinkingStatus';
import { type TranscriptModelContext } from '../utils/chatStreamTypes';

type TrackEventFn = (
  eventType: 'local-user-message',
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
  conversationRef?: string | null,
) => void;

type UseChatStreamLocalUserHandlerDeps = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
};

export function useChatStreamLocalUserHandler({
  addMessage,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamLocalUserHandlerDeps) {
  return useCallback((event: LocalUserMessageEvent, conversationRef?: string | null) => {
    const text = event.payload?.text;
    if (!text) {
      return;
    }
    const screenshotAttachments = buildScreenshotAttachments(
      event.payload?.screenshot_refs || [event.payload?.screenshot_ref],
      event.payload?.screenshot_url,
    );
    const firstScreenshotAttachment = screenshotAttachments[0] || buildScreenshotAttachment(
      event.payload?.screenshot_ref,
      event.payload?.screenshot_url,
    );
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
      sourceEventType: 'local-user-message',
      sourceChannel: 'from-backend',
      attachmentFilenames: Array.isArray(event.payload?.attachment_filenames)
        ? event.payload.attachment_filenames
        : null,
      screenshotRef: firstScreenshotAttachment.screenshotRef,
      screenshotUrl: firstScreenshotAttachment.screenshotUrl,
      screenshots: screenshotAttachments.length > 0
        ? screenshotAttachments.map((attachment) => ({
          screenshotRef: attachment.screenshotRef,
          screenshotUrl: attachment.screenshotUrl,
        }))
        : null,
      timestamp: event.payload?.timestamp,
      turnRef: event.turn_ref,
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

    recordTrackingEvent('local-user-message', event.turn_ref, {
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
