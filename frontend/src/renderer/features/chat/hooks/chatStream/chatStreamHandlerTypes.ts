/**
 * Handles chat stream types events for the renderer UI.
 */

export type TrackEventFn<EventType extends string = string> = (
  eventType: EventType,
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
  conversationRef?: string | null,
) => void;
