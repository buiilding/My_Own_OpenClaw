import { selectActiveWorkspaceState } from '../stores/chatWorkspaceState';
import { buildCurrentTurnMessagesFromProjection } from './state/chatBoxResponseState';

function isActiveProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  if (currentTurnProjection.phase && currentTurnProjection.phase !== 'idle') {
    return true;
  }
  return Boolean(
    currentTurnProjection.assistantText
    || currentTurnProjection.reasoningText
    || currentTurnProjection.lastError
    || currentTurnProjection.toolEvents?.length,
  );
}

function findCurrentTurnUserAnchor(messages, currentTurnProjection) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return -1;
  }
  const turnRef = currentTurnProjection?.turnRef;
  if (typeof turnRef === 'string' && turnRef) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.sender === 'user' && messages[index]?.turnRef === turnRef) {
        return index;
      }
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

function projectDashboardMessages(activeWorkspace) {
  const messages = activeWorkspace.messages;
  const currentTurnProjection = activeWorkspace.currentTurnProjection;
  if (!isActiveProjection(currentTurnProjection)) {
    return messages;
  }
  const projectionMessages = buildCurrentTurnMessagesFromProjection(currentTurnProjection);
  const projectedAssistantMessages = projectionMessages.filter((message) => message?.sender !== 'user');
  if (projectedAssistantMessages.length === 0) {
    return messages;
  }
  const anchorIndex = findCurrentTurnUserAnchor(messages, currentTurnProjection);
  if (anchorIndex === -1) {
    return projectedAssistantMessages;
  }
  return [
    ...messages.slice(0, anchorIndex + 1),
    ...projectedAssistantMessages,
  ];
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
