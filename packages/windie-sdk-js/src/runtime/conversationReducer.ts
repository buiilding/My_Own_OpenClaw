/**
 * Provides the conversation reducer module for the TypeScript SDK runtime.
 */

import type {
  ConversationEvent,
  ConversationRuntimeState,
  ToolEventPayload,
} from '../conversation/types.js';
import { resolveToolWaitId } from '../tools/toolCorrelationIds.js';
import { resolveActiveTurnRef } from './conversationEventScope.js';

export function createInitialConversationRuntimeState(
  conversationRef: string,
  revisionId = 'rev-empty',
): ConversationRuntimeState {
  return {
    conversationRef,
    revisionId,
    activeTurnRef: null,
    phase: 'idle',
    settings: {},
    pendingTools: {},
    activeBundle: null,
    compaction: { status: 'idle' },
    stream: {
      text: '',
      lastEventId: null,
    },
    stopState: {
      requested: false,
      turnRef: null,
    },
    lastError: null,
  };
}

function removeTool(
  pendingTools: Record<string, ToolEventPayload>,
  payload: unknown,
): Record<string, ToolEventPayload> {
  const key = resolveToolWaitId(payload);
  if (!key || !pendingTools[key]) {
    return pendingTools;
  }
  const next = { ...pendingTools };
  delete next[key];
  return next;
}

export function reduceConversationRuntimeState(
  state: ConversationRuntimeState,
  event: ConversationEvent,
): ConversationRuntimeState {
  if (event.conversationRef !== state.conversationRef) {
    return state;
  }
  const base = {
    ...state,
    revisionId: event.revisionId,
    activeTurnRef: resolveActiveTurnRef(state.activeTurnRef, event),
    stream: {
      ...state.stream,
      lastEventId: event.eventId,
    },
  };
  if (event.type === 'turn_started' || event.type === 'user_message') {
    return {
      ...base,
      phase: 'sending',
      lastError: null,
      stopState: { requested: false, turnRef: null },
    };
  }
  if (event.type === 'settings_updated') {
    return {
      ...base,
      phase: state.phase,
      settings: {
        ...state.settings,
        ...event.payload,
      },
    };
  }
  if (event.type === 'assistant_delta') {
    return {
      ...base,
      phase: 'streaming',
      stream: {
        lastEventId: event.eventId,
        text: `${state.stream.text}${typeof event.payload.text === 'string' ? event.payload.text : ''}`,
      },
    };
  }
  if (event.type === 'assistant_message') {
    return {
      ...base,
      phase: state.phase === 'tool_executing' || state.phase === 'tool_result_sent'
        ? state.phase
        : 'streaming',
    };
  }
  if (event.type === 'tool_call') {
    const key = resolveToolWaitId(event.payload);
    return {
      ...base,
      phase: 'tool_call_pending',
      pendingTools: key
        ? { ...state.pendingTools, [key]: event.payload as ToolEventPayload }
        : state.pendingTools,
    };
  }
  if (event.type === 'tool_bundle_call') {
    return {
      ...base,
      phase: 'tool_call_pending',
      activeBundle: event.payload as ToolEventPayload,
    };
  }
  if (event.type === 'tool_output') {
    const pendingTools = removeTool(state.pendingTools, event.payload);
    return {
      ...base,
      phase: Object.keys(pendingTools).length > 0 ? 'tool_executing' : 'tool_result_sent',
      pendingTools,
    };
  }
  if (event.type === 'tool_bundle_output') {
    return {
      ...base,
      phase: 'tool_result_sent',
      activeBundle: null,
    };
  }
  if (event.type === 'compaction_started') {
    return {
      ...base,
      phase: state.phase,
      compaction: { status: 'started', debug: event.payload },
    };
  }
  if (event.type === 'compaction_skipped') {
    return {
      ...base,
      phase: state.phase,
      compaction: {
        status: 'skipped',
        skippedReason: typeof event.payload.skippedReason === 'string'
          ? event.payload.skippedReason
          : (typeof event.payload.skipped_reason === 'string' ? event.payload.skipped_reason : null),
        debug: event.payload,
      },
    };
  }
  if (event.type === 'compaction_applied') {
    return {
      ...base,
      phase: state.phase,
      compaction: {
        status: 'applied',
        generationId: typeof event.payload.generationId === 'string'
          ? event.payload.generationId
          : null,
        summaryPreview: typeof event.payload.summaryPreview === 'string'
          ? event.payload.summaryPreview
          : null,
        debug: event.payload,
      },
    };
  }
  if (event.type === 'compaction_failed') {
    return {
      ...base,
      phase: state.phase,
      compaction: { status: 'failed', debug: event.payload },
    };
  }
  if (event.type === 'turn_completed') {
    return {
      ...base,
      phase: 'completed',
      pendingTools: {},
      activeBundle: null,
    };
  }
  if (event.type === 'turn_stopped') {
    if (event.turnRef && state.activeTurnRef && event.turnRef !== state.activeTurnRef) {
      return {
        ...base,
        phase: state.phase,
        stopState: state.stopState,
      };
    }
    return {
      ...base,
      phase: 'stopped',
      stopState: { requested: true, turnRef: event.turnRef ?? null },
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    return {
      ...base,
      phase: 'error',
      lastError: typeof event.payload.error === 'string'
        ? event.payload.error
        : (typeof event.payload.message === 'string' ? event.payload.message : 'Conversation runtime error'),
    };
  }
  return base;
}
