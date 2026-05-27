import { selectActiveWorkspaceState } from '../stores/chatWorkspaceState';
import { replaceCurrentTurnMessagesWithProjection } from './state/chatBoxResponseState';

let lastDashboardMessagesInput = null;
let lastDashboardProjectionInput = null;
let lastDashboardMessagesOutput = null;

function dedupeMessagesById(messages) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const duplicateIds = new Set();
  const seenIds = new Set();
  messages.forEach((message) => {
    const messageId = message?.id;
    if (!messageId) {
      return;
    }
    if (seenIds.has(messageId)) {
      duplicateIds.add(messageId);
      return;
    }
    seenIds.add(messageId);
  });

  if (duplicateIds.size === 0) {
    return messages;
  }

  const keptDuplicateIds = new Set();
  const nextMessages = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageId = message?.id;
    if (messageId && duplicateIds.has(messageId)) {
      if (keptDuplicateIds.has(messageId)) {
        continue;
      }
      keptDuplicateIds.add(messageId);
    }
    nextMessages.push(message);
  }
  nextMessages.reverse();
  return nextMessages;
}

function projectDashboardMessages(activeWorkspace) {
  if (
    lastDashboardMessagesInput === activeWorkspace.messages
    && lastDashboardProjectionInput === activeWorkspace.currentTurnProjection
    && lastDashboardMessagesOutput
  ) {
    return lastDashboardMessagesOutput;
  }

  const projectedMessages = dedupeMessagesById(
    replaceCurrentTurnMessagesWithProjection(
      activeWorkspace.messages,
      activeWorkspace.currentTurnProjection,
    ),
  );
  lastDashboardMessagesInput = activeWorkspace.messages;
  lastDashboardProjectionInput = activeWorkspace.currentTurnProjection;
  lastDashboardMessagesOutput = projectedMessages;
  return projectedMessages;
}

export function selectChatInterfaceState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: projectDashboardMessages(activeWorkspace),
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    compactionDebugInfo: activeWorkspace.compactionDebugInfo,
    tokenCounts: activeWorkspace.tokenCounts,
    streamPhase: activeWorkspace.streamTracking?.phase ?? 'idle',
  };
}

export function selectChatBoxState(state) {
  const activeWorkspace = selectActiveWorkspaceState(state);
  return {
    messages: activeWorkspace.messages,
    isSending: activeWorkspace.isSending,
    thinkingStatus: activeWorkspace.thinkingStatus,
    thinkingSourceEventType: activeWorkspace.thinkingSourceEventType,
    currentTurnProjection: activeWorkspace.currentTurnProjection,
  };
}
