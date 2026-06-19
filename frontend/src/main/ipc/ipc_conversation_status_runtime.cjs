/**
 * Projects SDK conversation runtime events into renderer-facing desktop status.
 */

function resolveConversationStatusError(event = {}) {
  return typeof event.payload?.error === 'string' ? event.payload.error : null;
}

function buildConversationTerminalStatus(event = {}, workspacePath = null) {
  if (event.type === 'turn_completed') {
    return {
      phase: 'ready',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_stopped') {
    return {
      phase: 'stopped',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    return {
      phase: 'error',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
      error: resolveConversationStatusError(event),
    };
  }
  return null;
}

module.exports = {
  buildConversationTerminalStatus,
  resolveConversationStatusError,
};
