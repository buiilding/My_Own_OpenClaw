/**
 * Provides the use response overlay view model module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import {
  buildResponseOverlayDismissalKey,
  useChatStore,
} from '../../chat/stores/chatStore';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../../app/runtime/desktopLiveTurnSurfaceRuntime';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import {
  DesktopCurrentTurnMessageRuntime,
} from '../../../app/runtime/desktopCurrentTurnMessageRuntime';
import { DesktopChatPillSessionRuntime } from '../../../app/runtime/desktopChatPillSessionRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from '../../../app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  buildRendererOverlayIntentTraceEvent,
  buildRendererOverlayTypingTraceEvent,
  buildRendererOverlayViewModelTracePayload,
  logRendererOverlayViewModelTrace,
  logRendererOverlayViewModelResolvedTrace,
} = DesktopRendererTraceRuntime;

const {
  resolveCurrentTurnPresentationState,
  resolveResponseOverlayDismissalTarget,
  resolveSdkResponseOverlayPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  buildCurrentTurnMessagesFromProjection,
  buildCurrentTurnMessagesFromPresentation,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
} = DesktopCurrentTurnMessageRuntime;
const {
  resolveConversationViewResponseOverlayDismissalTarget,
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  resolveChatPillViewIntent,
} = DesktopChatPillSessionRuntime;
const {
  applyVisibleTurnLifecycleToPresentationState,
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

function normalizeProjectedCurrentTurnEntries(currentTurnProjection) {
  return buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .filter(isVisibleResponseOverlayMessage);
}

function normalizeReasoningText(reasoningText) {
  return typeof reasoningText === 'string' ? reasoningText.trim() : '';
}

export function useResponseOverlayViewModel({
  messages = [],
  currentTurnProjection = null,
  conversationView = null,
  pendingTurn = null,
}) {
  const streamTracking = useChatStore(
    (state) => state.streamTracking,
  );
  const dismissedResponseOverlayEntries = useChatStore(
    (state) => state.dismissedResponseOverlayEntries,
  );
  const dismissResponseOverlayEntry = useChatStore(
    (state) => state.dismissResponseOverlayEntry,
  );
  const lastResolvedTraceSignatureRef = useRef(null);
  const lastTypingVisibleRef = useRef(null);
  const lastOverlayIntentModeRef = useRef(null);
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    pendingTurn,
    currentTurnProjection,
    conversationView,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    conversationView,
    pendingTurn,
    messages,
    visibleTurnLifecycle,
  });
  const useSdkLiveTurnPresentation = liveTurnPresentationInput.useSdkLiveTurnPresentation;
  const useConversationViewPresentation = liveTurnPresentationInput.useConversationViewPresentation;
  const useLocalPendingTurn = liveTurnPresentationInput.useLocalPendingTurn;
  const currentTurnPhase = liveTurnPresentationInput.phase;
  const responseOverlayEntries = useMemo(
    () => {
      if (useLocalPendingTurn) {
        return [];
      }
      if (useConversationViewPresentation) {
        return conversationView.liveTurn.entries
          .filter(isVisibleResponseOverlayMessage);
      }
      if (useSdkLiveTurnPresentation) {
        const presentationMessages = buildCurrentTurnMessagesFromPresentation(currentTurnProjection)
          .filter(isVisibleResponseOverlayMessage);
        return presentationMessages.length > 0
          ? presentationMessages
          : normalizeProjectedCurrentTurnEntries(currentTurnProjection);
      }
      return normalizeProjectedCurrentTurnEntries(currentTurnProjection);
    },
    [
      conversationView,
      currentTurnProjection,
      useConversationViewPresentation,
      useLocalPendingTurn,
      useSdkLiveTurnPresentation,
    ],
  );

  const currentTurnMessages = useMemo(
    () => (
      useLocalPendingTurn
        ? messages
        : responseOverlayEntries
    ),
    [messages, responseOverlayEntries, useLocalPendingTurn],
  );

  const responseOverlayDismissalTarget = useMemo(() => {
    if (useConversationViewPresentation) {
      return resolveConversationViewResponseOverlayDismissalTarget({
        conversationView,
        responseOverlayEntries,
      });
    }
    return resolveResponseOverlayDismissalTarget({
      currentTurnProjection,
      responseOverlayEntries,
      useSdkLiveTurnPresentation,
    });
  }, [
    conversationView,
    currentTurnProjection,
    responseOverlayEntries,
    useConversationViewPresentation,
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

  const currentTurnPresentationState = useMemo(
    () => resolveCurrentTurnPresentationState({
      messages: currentTurnMessages,
      dismissedResponseId,
    }),
    [currentTurnMessages, dismissedResponseId],
  );

  const resolvedCurrentTurnPresentationState = useMemo(
    () => {
      let presentationState;
      if (useConversationViewPresentation && !useLocalPendingTurn) {
        presentationState = {
          ...currentTurnPresentationState,
          isBusy: liveTurnPresentationInput.isBusy === true,
          overlayIntent: liveTurnPresentationInput.overlayIntent,
        };
      } else if (useSdkLiveTurnPresentation && !useLocalPendingTurn) {
        presentationState = resolveSdkResponseOverlayPresentationState({
          currentTurnProjection,
          responseOverlayEntries,
          dismissedResponseId,
          includeOverlayIntent: true,
        }) || currentTurnPresentationState;
      } else if (useLocalPendingTurn) {
        presentationState = {
          ...currentTurnPresentationState,
          overlayIntent: liveTurnPresentationInput.overlayIntent,
        };
      } else if (liveTurnPresentationInput.overlayIntent) {
        presentationState = {
          ...currentTurnPresentationState,
          overlayIntent: liveTurnPresentationInput.overlayIntent,
        };
      } else {
        presentationState = currentTurnPresentationState;
      }
      return applyVisibleTurnLifecycleToPresentationState(
        presentationState,
        visibleTurnLifecycle,
      );
    },
    [
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      liveTurnPresentationInput.isBusy,
      liveTurnPresentationInput.overlayIntent,
      visibleTurnLifecycle,
      responseOverlayEntries,
      useConversationViewPresentation,
      useLocalPendingTurn,
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
      if (isResponseOverlaySourceTaggedMessage(entry)) {
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
    if (!viewIntent.responseVisible) {
      return false;
    }
    if (resolvedCurrentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some(isResponseOverlayProgressMessage);
  }, [
    resolvedCurrentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    viewIntent.responseVisible,
  ]);

  const thinkingText = useMemo(
    () => normalizeReasoningText(
      currentTurnProjection?.reasoningText,
    ),
    [currentTurnProjection?.reasoningText],
  );

  useEffect(() => {
    const overlayIntent = resolvedCurrentTurnPresentationState.overlayIntent ?? null;
    const tracePayload = buildRendererOverlayViewModelTracePayload({
      currentTurnProjection,
      pendingTurn,
      streamTracking,
      visibleTurnLifecycle,
      currentTurnPhase,
      overlayIntent,
      currentTurnPresentationState: resolvedCurrentTurnPresentationState,
      responseOverlayEntries,
      viewIntent,
      useSdkLiveTurnPresentation,
      useConversationViewPresentation,
      useLocalPendingTurn,
    });
    const signature = JSON.stringify(tracePayload);
    if (lastResolvedTraceSignatureRef.current !== signature) {
      lastResolvedTraceSignatureRef.current = signature;
      logRendererOverlayViewModelResolvedTrace(tracePayload);
    }
    const typingTraceEvent = buildRendererOverlayTypingTraceEvent(tracePayload);
    if (lastTypingVisibleRef.current !== tracePayload.awaitingVisible) {
      lastTypingVisibleRef.current = tracePayload.awaitingVisible;
      logRendererOverlayViewModelTrace(
        typingTraceEvent.event,
        tracePayload,
        { reason: typingTraceEvent.reason },
      );
    }
    const intentTraceEvent = buildRendererOverlayIntentTraceEvent(tracePayload);
    if (lastOverlayIntentModeRef.current !== intentTraceEvent.mode) {
      lastOverlayIntentModeRef.current = intentTraceEvent.mode;
      logRendererOverlayViewModelTrace(
        intentTraceEvent.event,
        tracePayload,
        { reason: intentTraceEvent.reason },
      );
    }
  }, [
    currentTurnPhase,
    currentTurnProjection,
    conversationView,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
    pendingTurn,
    streamTracking,
    useLocalPendingTurn,
    useConversationViewPresentation,
    useSdkLiveTurnPresentation,
    visibleTurnLifecycle,
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
    DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox({
      turnRef: dismissalTarget.turnRef,
      guardRef: dismissalTarget.guardRef,
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
