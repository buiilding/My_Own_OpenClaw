/**
 * Projects SDK conversation state into ChatInterface presentation props.
 */

import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';
import {
  DesktopThreadPresentationRuntime,
} from './desktopThreadPresentationRuntime';

const {
  buildConversationViewChatMessages,
} = DesktopConversationDisplayProjection;
const {
  buildThreadPresentationMessages,
} = DesktopThreadPresentationRuntime;

function isConversationView(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildChatInterfacePresentationState({
  activeConversationRef = null,
  conversationView = null,
  currentTurnProjection = null,
  messages = [],
} = {}) {
  const hasConversationView = isConversationView(conversationView);
  return {
    renderedMessages: buildThreadPresentationMessages(messages, {
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

function buildConversationViewStoreProjection({
  activeConversationRef = null,
  currentMessages = [],
  pendingTurn = null,
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
  return {
    conversationRef,
    messages: buildConversationViewChatMessages({
      conversationView: view,
      currentMessages,
      pendingTurn,
      preserveRendererAnnotations: conversationRef === activeConversationRef,
    }),
  };
}

export const DesktopChatInterfacePresentationRuntime = Object.freeze({
  buildChatInterfacePresentationState,
  buildConversationViewStoreProjection,
});
