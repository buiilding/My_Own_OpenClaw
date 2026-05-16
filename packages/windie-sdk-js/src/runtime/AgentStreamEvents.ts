import {
  isBackendEvent,
  type BackendEvent,
} from '../events/backendEvents.js';
import type {
  ConversationEvent,
  JsonRecord,
} from '../conversation/types.js';
import type { WindieRuntimeEvent } from './ConversationRuntime.js';

export type WindieAgentStreamEvent =
  | {
      type: 'start';
      queryMessageId: string;
      conversationRef: string;
    }
  | {
      type: 'text';
      text: string;
      event: Extract<BackendEvent, { type: 'streaming-response' }>;
    }
  | {
      type: 'tool_call';
      toolName?: string;
      event: Extract<BackendEvent, { type: 'tool-call' }>;
    }
  | {
      type: 'tool_output';
      event: Extract<BackendEvent, { type: 'tool-output' }>;
    }
  | {
      type: 'complete';
      finalResponse?: string;
      event: Extract<BackendEvent, { type: 'streaming-complete' }>;
    }
  | {
      type: 'error';
      message: string;
      event?: Extract<BackendEvent, { type: 'error' }>;
      error?: unknown;
    }
  | {
      type: 'event';
      event: BackendEvent;
    };

function rawBackendEventFromConversationEvent(event: ConversationEvent): BackendEvent | null {
  const rawEvent = event.payload.rawEvent;
  return isBackendEvent(rawEvent) ? rawEvent : null;
}

function eventStringField(payload: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function toolOutputStreamKey(event: ConversationEvent): string | null {
  if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
    return null;
  }
  const requestId = eventStringField(event.payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
  if (requestId) {
    return `request:${requestId}`;
  }
  const bundleId = eventStringField(event.payload, 'bundleId', 'bundle_id');
  if (bundleId) {
    return `bundle:${bundleId}`;
  }
  const toolCallId = eventStringField(event.payload, 'toolCallId', 'tool_call_id');
  return toolCallId ? `tool-call:${toolCallId}` : null;
}

function syntheticToolOutputEvent(event: ConversationEvent): Extract<BackendEvent, { type: 'tool-output' }> {
  return {
    id: event.eventId,
    type: 'tool-output',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: event.payload,
  };
}

function syntheticStreamingResponseEvent(event: ConversationEvent): Extract<BackendEvent, { type: 'streaming-response' }> {
  return {
    id: event.eventId,
    type: 'streaming-response',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: {
      text: typeof event.payload.text === 'string' ? event.payload.text : '',
    },
  };
}

function syntheticStreamingCompleteEvent(event: ConversationEvent): Extract<BackendEvent, { type: 'streaming-complete' }> {
  return {
    id: event.eventId,
    type: 'streaming-complete',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: {
      final_response: typeof event.payload.finalResponse === 'string'
        ? event.payload.finalResponse
        : undefined,
    },
  };
}

function syntheticToolCallEvent(event: ConversationEvent): Extract<BackendEvent, { type: 'tool-call' }> {
  return {
    id: event.eventId,
    type: 'tool-call',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: {
      tool_name: typeof event.payload.toolName === 'string' ? event.payload.toolName : undefined,
      parameters: event.payload.args && typeof event.payload.args === 'object' && !Array.isArray(event.payload.args)
        ? event.payload.args as JsonRecord
        : undefined,
      request_id: typeof event.payload.requestId === 'string' ? event.payload.requestId : undefined,
      correlation_id: typeof event.payload.correlationId === 'string' ? event.payload.correlationId : undefined,
    },
  };
}

function syntheticErrorEvent(event: ConversationEvent): Extract<BackendEvent, { type: 'error' }> {
  const message = typeof event.payload.message === 'string'
    ? event.payload.message
    : (typeof event.payload.error === 'string' ? event.payload.error : 'Windie stream failed');
  return {
    id: event.eventId,
    type: 'error',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: {
      message,
    },
  };
}

export function toAgentStreamEvent(runtimeEvent: WindieRuntimeEvent): WindieAgentStreamEvent | null {
  if (runtimeEvent.type === 'turn_started') {
    return {
      type: 'start',
      queryMessageId: runtimeEvent.result.queryMessageId,
      conversationRef: runtimeEvent.snapshot.state.conversationRef,
    };
  }
  if (runtimeEvent.type === 'error') {
    return {
      type: 'error',
      message: runtimeEvent.error instanceof Error ? runtimeEvent.error.message : String(runtimeEvent.error),
      error: runtimeEvent.error,
    };
  }
  const event = runtimeEvent.event;
  const rawEvent = rawBackendEventFromConversationEvent(event);
  if (event.type === 'assistant_delta') {
    const backendEvent = rawEvent?.type === 'streaming-response'
      ? rawEvent
      : syntheticStreamingResponseEvent(event);
    return {
      type: 'text',
      text: typeof event.payload.text === 'string' ? event.payload.text : '',
      event: backendEvent,
    };
  }
  if (event.type === 'turn_completed') {
    const backendEvent = rawEvent?.type === 'streaming-complete'
      ? rawEvent
      : syntheticStreamingCompleteEvent(event);
    return {
      type: 'complete',
      finalResponse: typeof event.payload.finalResponse === 'string'
        ? event.payload.finalResponse
        : undefined,
      event: backendEvent,
    };
  }
  if (event.type === 'tool_call') {
    const backendEvent = rawEvent?.type === 'tool-call'
      ? rawEvent
      : syntheticToolCallEvent(event);
    return {
      type: 'tool_call',
      toolName: typeof event.payload.toolName === 'string' ? event.payload.toolName : undefined,
      event: backendEvent,
    };
  }
  if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
    const backendEvent = rawEvent?.type === 'tool-output'
      ? rawEvent
      : syntheticToolOutputEvent(event);
    return {
      type: 'tool_output',
      event: backendEvent,
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    const backendEvent = rawEvent?.type === 'error'
      ? rawEvent
      : syntheticErrorEvent(event);
    return {
      type: 'error',
      message: backendEvent.payload?.message || backendEvent.payload?.content || 'Windie stream failed',
      event: backendEvent,
    };
  }
  if (rawEvent) {
    return {
      type: 'event',
      event: rawEvent,
    };
  }
  return null;
}
