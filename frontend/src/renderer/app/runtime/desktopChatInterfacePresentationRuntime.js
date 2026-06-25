/**
 * Projects SDK conversation state into ChatInterface presentation props.
 */

import {
  DesktopThreadPresentationRuntime,
} from './desktopThreadPresentationRuntime';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';

const {
  buildThreadPresentationMessages,
} = DesktopThreadPresentationRuntime;
const {
  buildConversationViewChatMessages,
} = DesktopConversationDisplayProjection;

function isConversationView(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildChatInterfacePresentationState({
  activeConversationRef = null,
  conversationView = null,
  currentTurnProjection = null,
  messages = [],
  pendingTurn = null,
} = {}) {
  const hasConversationView = isConversationView(conversationView);
  const baseMessages = hasConversationView
    ? buildConversationViewChatMessages({
      conversationView,
      currentMessages: messages,
      pendingTurn,
      preserveRendererAnnotations: true,
    })
    : messages;
  return {
    renderedMessages: buildThreadPresentationMessages(baseMessages, {
      conversationView,
      currentTurnProjection,
      activeConversationRef,
    }),
    canEditMessages: hasConversationView
      ? conversationView?.actions?.canEdit === true
      : true,
    canRetryMessages: hasConversationView
      ? conversationView?.actions?.canRetry === true
      : true,
    activeRevisionId: hasConversationView
      ? conversationView?.revisionId || null
      : null,
  };
}

function resolveConversationViewStoreRef({
  activeConversationRef = null,
  targetConversationRef = null,
  view = null,
} = {}) {
  if (!isConversationView(view)) {
    return null;
  }
  const conversationRef = targetConversationRef || view.conversationRef || activeConversationRef;
  if (!conversationRef) {
    return null;
  }
  return conversationRef;
}

export const DesktopChatInterfacePresentationRuntime = Object.freeze({
  buildChatInterfacePresentationState,
  resolveConversationViewStoreRef,
});
