const ASSISTANT_BACKEND_TRACE_TYPES = new Set([
  'query-accepted',
  'streaming-response',
  'assistant-message-full',
  'streaming-complete',
  'error',
]);

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function safeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '-';
}

function payloadStringLength(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') {
      return value.length;
    }
  }
  return 0;
}

function shouldTraceAssistantBackendEvent(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && ASSISTANT_BACKEND_TRACE_TYPES.has(data.type),
  );
}

function buildBackendAssistantTraceSummary(data) {
  if (!data || typeof data !== 'object') {
    return 'type=unknown turn=- conv=- text_len=0 final_len=0 content_len=0';
  }
  const payload = safeObject(data.payload);
  return [
    `type=${safeString(data.type) || 'unknown'}`,
    `turn=${safeId(data.turn_ref || payload.turn_ref || payload.turnRef)}`,
    `conv=${safeId(data.conversation_ref || payload.conversation_ref || payload.conversationRef)}`,
    `text_len=${payloadStringLength(payload, ['text', 'delta', 'assistant_delta'])}`,
    `final_len=${payloadStringLength(payload, ['final_response', 'finalResponse'])}`,
    `content_len=${payloadStringLength(payload, ['content', 'message'])}`,
  ].join(' ');
}

function backendAssistantTraceAction(data) {
  switch (data?.type) {
    case 'query-accepted':
      return 'turn accepted';
    case 'streaming-response':
      return 'assistant chunk received';
    case 'assistant-message-full':
      return 'assistant message metadata received';
    case 'streaming-complete':
      return 'assistant complete received';
    case 'error':
      return 'assistant error received';
    default:
      return 'assistant event received';
  }
}

function traceAssistantBackendEvent(data, { log }) {
  if (!shouldTraceAssistantBackendEvent(data) || typeof log !== 'function') {
    return false;
  }
  log(`[AssistantTrace][backend] ${backendAssistantTraceAction(data)} ${buildBackendAssistantTraceSummary(data)}`);
  return true;
}

function currentTurnTraceKey(currentTurn) {
  const conversationRef = safeId(currentTurn?.conversationRef || currentTurn?.conversation_ref);
  const turnRef = safeId(currentTurn?.turnRef || currentTurn?.turn_ref);
  return `${conversationRef}:${turnRef}`;
}

function currentTurnTraceSnapshot(currentTurn) {
  const toolEvents = Array.isArray(currentTurn?.toolEvents) ? currentTurn.toolEvents : [];
  return {
    conversationRef: safeId(currentTurn?.conversationRef || currentTurn?.conversation_ref),
    turnRef: safeId(currentTurn?.turnRef || currentTurn?.turn_ref),
    phase: safeString(currentTurn?.phase) || 'unknown',
    assistantLength: safeString(currentTurn?.assistantText).length,
    reasoningLength: safeString(currentTurn?.reasoningText).length,
    toolCount: toolEvents.length,
    lastError: currentTurn?.lastError || null,
  };
}

function buildCurrentTurnTraceSummary(snapshot) {
  return [
    `phase=${snapshot.phase}`,
    `turn=${snapshot.turnRef}`,
    `conv=${snapshot.conversationRef}`,
    `assistant_len=${snapshot.assistantLength}`,
    `reasoning_len=${snapshot.reasoningLength}`,
    `tool_events=${snapshot.toolCount}`,
  ].join(' ');
}

function createCurrentTurnTraceLogger({ log, maxTrackedTurns = 64 } = {}) {
  const cursors = new Map();

  function remember(key, snapshot) {
    cursors.set(key, snapshot);
    if (cursors.size <= maxTrackedTurns) {
      return;
    }
    const [oldestKey] = cursors.keys();
    cursors.delete(oldestKey);
  }

  function trace(currentTurn) {
    if (!currentTurn || typeof currentTurn !== 'object' || typeof log !== 'function') {
      return [];
    }
    const key = currentTurnTraceKey(currentTurn);
    const previous = cursors.get(key) || null;
    const snapshot = currentTurnTraceSnapshot(currentTurn);
    const summary = buildCurrentTurnTraceSummary(snapshot);
    const emitted = [];

    function emit(message) {
      const fullMessage = `[AssistantTrace][sdk] ${message}`;
      log(fullMessage);
      emitted.push(fullMessage);
    }

    if (!previous) {
      emit(`turn projection opened ${summary}`);
    }

    if (
      snapshot.assistantLength > 0
      && (!previous || previous.assistantLength === 0)
    ) {
      emit(`assistant response started ${summary}`);
    } else if (
      previous
      && snapshot.assistantLength !== previous.assistantLength
    ) {
      const deltaLength = snapshot.assistantLength - previous.assistantLength;
      emit(`assistant text advanced delta_len=${deltaLength} ${summary}`);
    }

    if (previous && snapshot.phase !== previous.phase) {
      emit(`phase changed from=${previous.phase} to=${snapshot.phase} ${summary}`);
    }

    if (previous && snapshot.toolCount !== previous.toolCount) {
      emit(`tool event count changed from=${previous.toolCount} to=${snapshot.toolCount} ${summary}`);
    }

    if (snapshot.phase === 'complete' && (!previous || previous.phase !== 'complete')) {
      emit(`assistant complete ${summary}`);
    }

    if (
      snapshot.phase === 'error'
      && (!previous || previous.phase !== 'error' || previous.lastError !== snapshot.lastError)
    ) {
      emit(`assistant error last_error=${safeString(snapshot.lastError) || '-'} ${summary}`);
    }

    remember(key, snapshot);
    return emitted;
  }

  function reset() {
    cursors.clear();
  }

  return {
    reset,
    trace,
  };
}

module.exports = {
  buildBackendAssistantTraceSummary,
  createCurrentTurnTraceLogger,
  shouldTraceAssistantBackendEvent,
  traceAssistantBackendEvent,
};
