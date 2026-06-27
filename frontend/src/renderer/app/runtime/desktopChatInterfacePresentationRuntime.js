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

function readExactIdentityString(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return null;
  }
  return value;
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
  sdkLiveTurnConversationRef: null,
  sdkLiveTurnTurnRef: null,
  sdkLiveTurnPhase: null,
  sdkLiveTurnPresentation: null,
  sdkLiveTurnPresentationEntries: null,
  sdkLiveTurnPresentationLastError: null,
  sdkLiveTurnLegacyNoPresentationAssistantText: null,
  sdkLiveTurnLegacyNoPresentationReasoningText: null,
  sdkLiveTurnLegacyNoPresentationToolEvents: null,
  sdkLiveTurnLegacyNoPresentationLastError: null,
  state: null,
};

function recordOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function buildSdkLiveTurnCacheKey(sdkLiveTurn) {
  const liveTurn = recordOrNull(sdkLiveTurn);
  if (!liveTurn) {
    return {
      conversationRef: null,
      turnRef: null,
      phase: null,
      presentation: null,
      presentationEntries: null,
      presentationLastError: null,
      legacyNoPresentationAssistantText: null,
      legacyNoPresentationReasoningText: null,
      legacyNoPresentationToolEvents: null,
      legacyNoPresentationLastError: null,
    };
  }
  const presentation = recordOrNull(liveTurn.presentation);
  const presentationEntries = Array.isArray(presentation?.entries)
    ? presentation.entries
    : null;
  if (presentation) {
    return {
      conversationRef: liveTurn.conversationRef ?? null,
      turnRef: liveTurn.turnRef ?? null,
      phase: liveTurn.phase ?? null,
      presentation,
      presentationEntries,
      presentationLastError: presentation.lastError ?? null,
      legacyNoPresentationAssistantText: null,
      legacyNoPresentationReasoningText: null,
      legacyNoPresentationToolEvents: null,
      legacyNoPresentationLastError: null,
    };
  }
  return {
    conversationRef: liveTurn.conversationRef ?? null,
    turnRef: liveTurn.turnRef ?? null,
    phase: liveTurn.phase ?? null,
    presentation: null,
    presentationEntries: null,
    presentationLastError: null,
    legacyNoPresentationAssistantText: liveTurn.assistantText,
    legacyNoPresentationReasoningText: liveTurn.reasoningText,
    legacyNoPresentationToolEvents: liveTurn.toolEvents,
    legacyNoPresentationLastError: liveTurn.lastError,
  };
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
  const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn;
  const effectiveMessages = hasConversationView ? null : messages;
  const sdkLiveTurnCacheKey = buildSdkLiveTurnCacheKey(effectiveSdkLiveTurn);
  if (
    chatInterfacePresentationCache.state
    && chatInterfacePresentationCache.activeConversationRef === activeConversationRef
    && chatInterfacePresentationCache.conversationView === conversationView
    && chatInterfacePresentationCache.conversationViewDisplayRows === conversationView?.displayRows
    && chatInterfacePresentationCache.conversationViewLiveTurn === conversationView?.liveTurn
    && chatInterfacePresentationCache.conversationViewLiveEntries === conversationView?.liveTurn?.entries
    && chatInterfacePresentationCache.messages === effectiveMessages
    && chatInterfacePresentationCache.pendingTurn === pendingTurn
    && chatInterfacePresentationCache.rendererAnnotations === rendererAnnotations
    && chatInterfacePresentationCache.sdkLiveTurnConversationRef === sdkLiveTurnCacheKey.conversationRef
    && chatInterfacePresentationCache.sdkLiveTurnTurnRef === sdkLiveTurnCacheKey.turnRef
    && chatInterfacePresentationCache.sdkLiveTurnPhase === sdkLiveTurnCacheKey.phase
    && chatInterfacePresentationCache.sdkLiveTurnPresentation === sdkLiveTurnCacheKey.presentation
    && chatInterfacePresentationCache.sdkLiveTurnPresentationEntries === sdkLiveTurnCacheKey.presentationEntries
    && chatInterfacePresentationCache.sdkLiveTurnPresentationLastError === sdkLiveTurnCacheKey.presentationLastError
    && chatInterfacePresentationCache.sdkLiveTurnLegacyNoPresentationAssistantText
      === sdkLiveTurnCacheKey.legacyNoPresentationAssistantText
    && chatInterfacePresentationCache.sdkLiveTurnLegacyNoPresentationReasoningText
      === sdkLiveTurnCacheKey.legacyNoPresentationReasoningText
    && chatInterfacePresentationCache.sdkLiveTurnLegacyNoPresentationToolEvents
      === sdkLiveTurnCacheKey.legacyNoPresentationToolEvents
    && chatInterfacePresentationCache.sdkLiveTurnLegacyNoPresentationLastError
      === sdkLiveTurnCacheKey.legacyNoPresentationLastError
  ) {
    return chatInterfacePresentationCache.state;
  }
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
    messages: effectiveMessages,
    pendingTurn,
    rendererAnnotations,
    sdkLiveTurnConversationRef: sdkLiveTurnCacheKey.conversationRef,
    sdkLiveTurnTurnRef: sdkLiveTurnCacheKey.turnRef,
    sdkLiveTurnPhase: sdkLiveTurnCacheKey.phase,
    sdkLiveTurnPresentation: sdkLiveTurnCacheKey.presentation,
    sdkLiveTurnPresentationEntries: sdkLiveTurnCacheKey.presentationEntries,
    sdkLiveTurnPresentationLastError: sdkLiveTurnCacheKey.presentationLastError,
    sdkLiveTurnLegacyNoPresentationAssistantText: sdkLiveTurnCacheKey.legacyNoPresentationAssistantText,
    sdkLiveTurnLegacyNoPresentationReasoningText: sdkLiveTurnCacheKey.legacyNoPresentationReasoningText,
    sdkLiveTurnLegacyNoPresentationToolEvents: sdkLiveTurnCacheKey.legacyNoPresentationToolEvents,
    sdkLiveTurnLegacyNoPresentationLastError: sdkLiveTurnCacheKey.legacyNoPresentationLastError,
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
  const viewConversationRef = readExactIdentityString(view.conversationRef);
  if (!viewConversationRef) {
    return null;
  }
  const targetRef = readExactIdentityString(targetConversationRef);
  if (
    targetConversationRef !== null
    && targetConversationRef !== undefined
    && targetRef !== viewConversationRef
  ) {
    return null;
  }
  const activeRef = readExactIdentityString(activeConversationRef);
  if (
    !targetRef
    && activeConversationRef !== null
    && activeConversationRef !== undefined
    && activeRef !== viewConversationRef
  ) {
    return null;
  }
  return viewConversationRef;
}

export const DesktopChatInterfacePresentationRuntime = Object.freeze({
  buildChatInterfacePresentationState,
  resolveConversationViewStoreRef,
});
