/**
 * Provides the use response overlay view model module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCurrentTurnPresentationState } from '../../chat/hooks/useCurrentTurnPresentationState';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import {
  buildResponseOverlayDismissalKey,
  useChatStore,
} from '../../chat/stores/chatStore';
import { OVERLAY_TURN_LIFECYCLE } from '../../../app/runtime/desktopOverlayTurnLifecycleRuntime';
import {
  resolveLiveTurnPresentationInput,
  resolveSdkOverlayIntent,
} from '../../chat/utils/state/liveTurnSurfaceState';
import {
  buildCurrentTurnMessagesFromProjection,
  isResponseCloseable,
  normalizeThinkingText,
} from '../../chat/utils/state/chatBoxResponseState';
import { buildCurrentTurnMessagesFromPresentation } from '../../chat/utils/message/liveTurnPresentationMessages';
import { resolveChatPillViewIntent } from '../../chat/utils/chatPill/chatPillSessionFlow';
import { logRendererLiveSurfaceTrace } from '../../chat/utils/chatStream/chatStreamDebugTrace';

function normalizeProjectedCurrentTurnEntries(currentTurnProjection) {
  return buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .filter(isVisibleOverlayMessage);
}

function isVisibleOverlayMessage(message) {
  return (
    message
    && message.sender === 'assistant'
    && (
      (typeof message.text === 'string' && message.text.trim())
      || (typeof message.thinkingText === 'string' && message.thinkingText.trim())
      || message.type === 'tool-call'
      || message.type === 'tool-output'
      || message.type === 'search-source'
      || message.type === 'tool-explanation'
      || message.type === 'error'
    )
  );
}

function resolveSdkOverlayLifecycle(presentation, overlayIntent) {
  if (!presentation) {
    return OVERLAY_TURN_LIFECYCLE.IDLE;
  }
  if (overlayIntent?.mode === 'awaiting') {
    return OVERLAY_TURN_LIFECYCLE.AWAITING;
  }
  if (overlayIntent?.mode === 'response' && presentation.isBusy) {
    return OVERLAY_TURN_LIFECYCLE.ACTIVE;
  }
  if (presentation.isTerminal) {
    return OVERLAY_TURN_LIFECYCLE.TERMINAL;
  }
  return OVERLAY_TURN_LIFECYCLE.IDLE;
}

function buildSdkCurrentTurnPresentationState({
  currentTurnProjection,
  responseOverlayEntries,
  dismissedResponseId,
}) {
  const presentation = currentTurnProjection?.presentation;
  const latestEntry = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1]
    : null;
  const visibleResponse = (
    latestEntry && latestEntry.id !== dismissedResponseId
      ? latestEntry
      : null
  );
  const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
  const awaitingVisible = overlayIntent.mode === 'awaiting';
  const responseVisible = overlayIntent.mode === 'response';
  const overlayTurnLifecycle = resolveSdkOverlayLifecycle(presentation, overlayIntent);
  return {
    activeResponse: visibleResponse,
    hasVisibleReply: presentation?.hasVisibleContent === true,
    loopUiState: responseVisible ? 'active-response' : (awaitingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation?.isBusy === true,
    isAwaitingReply: awaitingVisible,
    showAssistantAwaitingDot: awaitingVisible,
    awaitingDotTargetMessageId: null,
    visibleResponse,
    chatboxSurfaceState: responseVisible ? 'response' : (awaitingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: awaitingVisible,
    showChatboxResponse: responseVisible,
    isTransportConnected: true,
    overlayTurnLifecycle,
    overlayIntent,
  };
}

export function useResponseOverlayViewModel({
  messages = [],
  isSending = false,
  thinkingStatus,
  currentTurnProjection = null,
  pendingTurn = null,
}) {
  const dismissedResponseOverlayEntries = useChatStore(
    (state) => state.dismissedResponseOverlayEntries,
  );
  const dismissResponseOverlayEntry = useChatStore(
    (state) => state.dismissResponseOverlayEntry,
  );
  const lastResolvedTraceSignatureRef = useRef(null);
  const lastTypingVisibleRef = useRef(null);
  const lastOverlayIntentModeRef = useRef(null);
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    pendingTurn,
    isSending,
    messages,
  });
  const useSdkLiveTurnPresentation = liveTurnPresentationInput.useSdkLiveTurnPresentation;
  const useLocalSendLatch = liveTurnPresentationInput.useLocalSendLatch;
  const currentTurnPhase = liveTurnPresentationInput.phase;
  const currentTurnIsSending = liveTurnPresentationInput.isSending;

  const responseOverlayEntries = useMemo(
    () => {
      if (useLocalSendLatch) {
        return [];
      }
      if (useSdkLiveTurnPresentation) {
        return buildCurrentTurnMessagesFromPresentation(currentTurnProjection)
          .filter(isVisibleOverlayMessage);
      }
      return normalizeProjectedCurrentTurnEntries(currentTurnProjection);
    },
    [currentTurnProjection, useLocalSendLatch, useSdkLiveTurnPresentation],
  );

  const currentTurnMessages = useMemo(
    () => (
      useLocalSendLatch
        ? messages
        : responseOverlayEntries
    ),
    [messages, responseOverlayEntries, useLocalSendLatch],
  );

  const responseOverlayDismissalTarget = useMemo(() => {
    if (responseOverlayEntries.length === 0) {
      return null;
    }
    const latestEntry = responseOverlayEntries[responseOverlayEntries.length - 1];
    if (!latestEntry?.id) {
      return null;
    }
    const sdkOverlayIntent = useSdkLiveTurnPresentation
      ? resolveSdkOverlayIntent(currentTurnProjection?.presentation, currentTurnProjection)
      : null;
    const turnRef = (
      sdkOverlayIntent?.turnRef
      || latestEntry.turnRef
      || currentTurnProjection?.turnRef
      || null
    );
    const conversationRef = (
      sdkOverlayIntent?.conversationRef
      || currentTurnProjection?.conversationRef
      || null
    );
    const guardRef = (
      sdkOverlayIntent?.staleGuardRef
      || sdkOverlayIntent?.turnRef
      || turnRef
      || null
    );
    return {
      conversationRef,
      turnRef,
      guardRef,
      responseEntryId: latestEntry.id,
    };
  }, [
    currentTurnProjection,
    responseOverlayEntries,
    useSdkLiveTurnPresentation,
  ]);

  const dismissedResponseId = useMemo(() => {
    const dismissalKey = buildResponseOverlayDismissalKey(responseOverlayDismissalTarget || {});
    if (!dismissalKey || !dismissedResponseOverlayEntries[dismissalKey]) {
      return null;
    }
    return responseOverlayDismissalTarget.responseEntryId;
  }, [
    dismissedResponseOverlayEntries,
    responseOverlayDismissalTarget,
  ]);

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: currentTurnPhase,
    isSending: currentTurnIsSending,
    messages: currentTurnMessages,
    dismissedResponseId,
  });

  const resolvedCurrentTurnPresentationState = useMemo(
    () => {
      if (useSdkLiveTurnPresentation && !useLocalSendLatch) {
        return buildSdkCurrentTurnPresentationState({
          currentTurnProjection,
          responseOverlayEntries,
          dismissedResponseId,
        });
      }
      if (useLocalSendLatch) {
        return {
          ...currentTurnPresentationState,
          overlayIntent: liveTurnPresentationInput.overlayIntent,
        };
      }
      return currentTurnPresentationState;
    },
    [
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      liveTurnPresentationInput.overlayIntent,
      responseOverlayEntries,
      useLocalSendLatch,
      useSdkLiveTurnPresentation,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages: currentTurnMessages,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  }), [
    currentTurnMessages,
    dismissedResponseId,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
  ]);

  const latestSourceTaggedResponseEntry = useMemo(() => {
    for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
      const entry = responseOverlayEntries[index];
      if (entry?.type === 'llm-text' || entry?.type === 'error') {
        return entry;
      }
      if (typeof entry?.sourceEventType === 'string' && entry.sourceEventType.trim()) {
        return entry;
      }
    }
    return null;
  }, [responseOverlayEntries]);

  const responseEntrySignature = useMemo(
    () => responseOverlayEntries.map((entry) => `${entry.id}:${entry.text}`).join('\u0001'),
    [responseOverlayEntries],
  );

  const responseIsCloseable = useMemo(() => {
    if (!viewIntent.showResponse) {
      return false;
    }
    if (resolvedCurrentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some((entry) => (
        entry.type === 'tool-explanation'
        || entry.type === 'tool-call'
        || entry.type === 'tool-output'
        || entry.type === 'search-source'
      ));
  }, [
    resolvedCurrentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    viewIntent.showResponse,
  ]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(
      currentTurnProjection?.reasoningText ?? thinkingStatus,
    ),
    [currentTurnProjection?.reasoningText, thinkingStatus],
  );

  useEffect(() => {
    const overlayIntent = resolvedCurrentTurnPresentationState.overlayIntent ?? null;
    const awaitingVisible = viewIntent.showAwaitingReply === true;
    const responseVisible = viewIntent.showResponse === true;
    const tracePayload = {
      source: 'renderer-overlay-view-model',
      turnRef: currentTurnProjection?.turnRef || null,
      conversationRef: currentTurnProjection?.conversationRef || overlayIntent?.conversationRef || null,
      phase: currentTurnProjection?.phase || currentTurnPhase,
      overlayMode: overlayIntent?.mode || null,
      guardRef: overlayIntent?.staleGuardRef || overlayIntent?.turnRef || currentTurnProjection?.turnRef || null,
      awaitingVisible,
      responseVisible,
      showAwaitingDot: resolvedCurrentTurnPresentationState.showAssistantAwaitingDot === true,
      hasVisibleReply: resolvedCurrentTurnPresentationState.hasVisibleReply === true,
      isBusy: resolvedCurrentTurnPresentationState.isBusy === true,
      overlayTurnLifecycle: resolvedCurrentTurnPresentationState.overlayTurnLifecycle || null,
      entryCount: responseOverlayEntries.length,
      visibleResponseId: viewIntent.visibleResponse?.id || null,
      latestEntryId: viewIntent.latestResponseOverlayEntryId || null,
      useSdkLiveTurnPresentation,
      useLocalSendLatch,
    };
    const signature = JSON.stringify(tracePayload);
    if (lastResolvedTraceSignatureRef.current !== signature) {
      lastResolvedTraceSignatureRef.current = signature;
      logRendererLiveSurfaceTrace(
        'renderer.overlay_view_model.resolved',
        tracePayload,
        tracePayload.conversationRef,
      );
    }
    if (lastTypingVisibleRef.current !== awaitingVisible) {
      lastTypingVisibleRef.current = awaitingVisible;
      logRendererLiveSurfaceTrace(
        awaitingVisible ? 'typing.show' : 'typing.hide',
        {
          ...tracePayload,
          reason: awaitingVisible
            ? (useSdkLiveTurnPresentation ? 'sdk-awaiting' : 'preflight-awaiting')
            : (responseVisible ? 'response-visible' : 'not-awaiting'),
        },
        tracePayload.conversationRef,
      );
    }
    const nextOverlayIntentMode = awaitingVisible
      ? 'awaiting'
      : (responseVisible ? 'response' : 'hidden');
    if (lastOverlayIntentModeRef.current !== nextOverlayIntentMode) {
      lastOverlayIntentModeRef.current = nextOverlayIntentMode;
      const nextOverlayIntentEvent = nextOverlayIntentMode === 'awaiting'
        ? 'response_overlay.intent.show_awaiting'
        : (nextOverlayIntentMode === 'response'
          ? 'response_overlay.intent.show_response'
          : 'response_overlay.intent.hide');
      logRendererLiveSurfaceTrace(
        nextOverlayIntentEvent,
        {
          ...tracePayload,
          reason: nextOverlayIntentMode === 'awaiting'
            ? 'renderer-view-model-awaiting'
            : (nextOverlayIntentMode === 'response'
              ? 'renderer-view-model-response'
              : 'renderer-view-model-hidden'),
        },
        tracePayload.conversationRef,
      );
    }
  }, [
    currentTurnPhase,
    currentTurnProjection?.conversationRef,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    responseOverlayEntries.length,
    resolvedCurrentTurnPresentationState,
    useLocalSendLatch,
    useSdkLiveTurnPresentation,
    viewIntent,
  ]);

  const handleCloseResponse = useCallback(() => {
    if (
      !viewIntent.latestResponseOverlayEntryId
      || !responseIsCloseable
      || !responseOverlayDismissalTarget
    ) {
      return;
    }
    const dismissalTarget = {
      ...responseOverlayDismissalTarget,
      responseEntryId: viewIntent.latestResponseOverlayEntryId,
    };
    dismissResponseOverlayEntry(dismissalTarget);
    DesktopResponseOverlayRuntimeClient.setResponseboxSize({
      visible: false,
      width: 0,
      height: 0,
      turn_ref: dismissalTarget.turnRef,
      stale_guard_ref: dismissalTarget.guardRef || dismissalTarget.turnRef,
      dismissed: true,
    }).catch((error) => {
      console.warn('[MinimalResponseOverlay] Failed to dismiss response overlay:', error);
    });
  }, [
    dismissResponseOverlayEntry,
    responseIsCloseable,
    responseOverlayDismissalTarget,
    viewIntent.latestResponseOverlayEntryId,
  ]);

  return {
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    overlayIntent: resolvedCurrentTurnPresentationState.overlayIntent ?? null,
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    thinkingText,
    handleCloseResponse,
    ...viewIntent,
  };
}
