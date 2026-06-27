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
  buildPendingBridgeChatMessages,
} = DesktopConversationDisplayProjection;

function isConversationView(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

let chatInterfacePresentationCache = {
  activeConversationRef: null,
  conversationView: null,
  conversationViewDisplayRows: null,
  conversationViewLiveTurn: null,
  conversationViewLiveEntries: null,
  messages: null,
  pendingTurn: null,
  rendererAnnotations: null,
  sdkLiveTurn: null,
  sdkLiveTurnPhase: null,
  sdkLiveTurnAssistantText: null,
  sdkLiveTurnReasoningText: null,
  sdkLiveTurnToolEvents: null,
  state: null,
};

function buildChatInterfacePresentationState({
  activeConversationRef = null,
  conversationView = null,
  messages = [],
  pendingTurn = null,
  rendererAnnotations = [],
  sdkLiveTurn = null,
} = {}) {
  if (
    chatInterfacePresentationCache.state
    && chatInterfacePresentationCache.activeConversationRef === activeConversationRef
    && chatInterfacePresentationCache.conversationView === conversationView
    && chatInterfacePresentationCache.conversationViewDisplayRows === conversationView?.displayRows
    && chatInterfacePresentationCache.conversationViewLiveTurn === conversationView?.liveTurn
    && chatInterfacePresentationCache.conversationViewLiveEntries === conversationView?.liveTurn?.entries
    && chatInterfacePresentationCache.messages === messages
    && chatInterfacePresentationCache.pendingTurn === pendingTurn
    && chatInterfacePresentationCache.rendererAnnotations === rendererAnnotations
    && chatInterfacePresentationCache.sdkLiveTurn === sdkLiveTurn
    && chatInterfacePresentationCache.sdkLiveTurnPhase === sdkLiveTurn?.phase
    && chatInterfacePresentationCache.sdkLiveTurnAssistantText === sdkLiveTurn?.assistantText
    && chatInterfacePresentationCache.sdkLiveTurnReasoningText === sdkLiveTurn?.reasoningText
    && chatInterfacePresentationCache.sdkLiveTurnToolEvents === sdkLiveTurn?.toolEvents
  ) {
    return chatInterfacePresentationCache.state;
  }
  const hasConversationView = isConversationView(conversationView);
  const baseMessages = hasConversationView
    ? buildConversationViewChatMessages({
      conversationView,
      pendingTurn,
      preserveRendererAnnotations: true,
      rendererAnnotations,
    })
    : buildPendingBridgeChatMessages({
      messages,
      pendingTurn,
    });
  const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn;
  const state = {
    renderedMessages: buildThreadPresentationMessages(baseMessages, {
      conversationView,
      sdkLiveTurn: effectiveSdkLiveTurn,
      activeConversationRef,
    }),
    activeRevisionId: hasConversationView
      ? conversationView?.revisionId || null
      : null,
  };
  chatInterfacePresentationCache = {
    activeConversationRef,
    conversationView,
    conversationViewDisplayRows: conversationView?.displayRows,
    conversationViewLiveTurn: conversationView?.liveTurn,
    conversationViewLiveEntries: conversationView?.liveTurn?.entries,
    messages,
    pendingTurn,
    rendererAnnotations,
    sdkLiveTurn,
    sdkLiveTurnPhase: sdkLiveTurn?.phase,
    sdkLiveTurnAssistantText: sdkLiveTurn?.assistantText,
    sdkLiveTurnReasoningText: sdkLiveTurn?.reasoningText,
    sdkLiveTurnToolEvents: sdkLiveTurn?.toolEvents,
    state,
  };
  return state;
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
