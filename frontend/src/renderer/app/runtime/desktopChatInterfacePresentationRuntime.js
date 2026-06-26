/**
 * Projects SDK conversation state into ChatInterface presentation props.
 */

import {
  DesktopThreadPresentationRuntime,
} from './desktopThreadPresentationRuntime';
import {
  DesktopConversationDisplayProjection,
} from './desktopConversationDisplayProjection';
import {
  DesktopPendingTurnBridgeRuntime,
} from './desktopPendingTurnBridgeRuntime';

const {
  buildThreadPresentationMessages,
} = DesktopThreadPresentationRuntime;
const {
  buildConversationViewChatMessages,
} = DesktopConversationDisplayProjection;
const {
  buildPendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;

function isConversationView(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeTurnRef(turnRef) {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function hasUserMessageForTurn(messages, turnRef) {
  if (!turnRef) {
    return false;
  }
  return messages.some((message) => (
    message?.sender === 'user'
    && normalizeTurnRef(message.turnRef) === turnRef
  ));
}

function buildNoViewPendingBridgeMessages(messages, pendingTurn) {
  const baseMessages = Array.isArray(messages) ? messages : [];
  const pendingMessage = buildPendingTurnUserMessage(pendingTurn);
  if (!pendingMessage?.id) {
    return baseMessages;
  }
  const pendingTurnRef = normalizeTurnRef(pendingMessage.turnRef);
  if (
    baseMessages.some((message) => message?.id === pendingMessage.id)
    || hasUserMessageForTurn(baseMessages, pendingTurnRef)
  ) {
    return baseMessages;
  }
  return [...baseMessages, pendingMessage];
}

function buildChatInterfacePresentationState({
  activeConversationRef = null,
  conversationView = null,
  messages = [],
  pendingTurn = null,
  rendererAnnotations = [],
  sdkLiveTurn = null,
} = {}) {
  const hasConversationView = isConversationView(conversationView);
  const baseMessages = hasConversationView
    ? buildConversationViewChatMessages({
      conversationView,
      pendingTurn,
      preserveRendererAnnotations: true,
      rendererAnnotations,
    })
    : buildNoViewPendingBridgeMessages(messages, pendingTurn);
  const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn;
  return {
    renderedMessages: buildThreadPresentationMessages(baseMessages, {
      conversationView,
      sdkLiveTurn: effectiveSdkLiveTurn,
      activeConversationRef,
    }),
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
