import { type ChatMessage } from '../../stores/chatStore';
import { type TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';

export type TrackEventFn<EventType extends string = string> = (
  eventType: EventType,
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
  conversationRef?: string | null,
) => void;

export type ChatStreamThinkingStateDeps<EventType extends string = string> = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn<EventType>;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
};
