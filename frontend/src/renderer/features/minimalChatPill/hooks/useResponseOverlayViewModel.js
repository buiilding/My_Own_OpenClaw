/**
 * Provides the use response overlay view model module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import { useChatStore } from '../../chat/stores/chatStore';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../../app/runtime/desktopLiveTurnSurfaceRuntime';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import {
  DesktopCurrentTurnMessageRuntime,
} from '../../../app/runtime/desktopCurrentTurnMessageRuntime';
import {
  DesktopResponseOverlayViewRuntime,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';
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
} = DesktopCurrentTurnPresentationRuntime;
const {
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
} = DesktopCurrentTurnMessageRuntime;
const {
  buildResponseOverlayDismissalKey,
  resolveResponseOverlayEntries,
  resolveResponseOverlayPresentationState,
} = DesktopResponseOverlayViewRuntime;
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  resolveChatPillViewIntent,
} = DesktopChatPillSessionRuntime;
const {
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

function normalizeReasoningText(reasoningText) {
  return typeof reasoningText === 'string' ? reasoningText.trim() : '';
}

export function useResponseOverlayViewModel({
  chatSurfaceState = null,
}) {
  const {
    messages = [],
    conversationView = null,
    currentTurnProjection = null,
    pendingTurn = null,
  } = chatSurfaceState || {};
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
    conversationView,
    pendingTurn,
    currentTurnProjection,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    conversationView,
    currentTurnProjection,
    pendingTurn,
    messages,
    visibleTurnLifecycle,
  });
  const useSdkLiveTurnPresentation = liveTurnPresentationInput.useSdkLiveTurnPresentation;
  const useLocalPendingTurn = liveTurnPresentationInput.useLocalPendingTurn;
  const currentTurnPhase = liveTurnPresentationInput.phase;
  const responseOverlayEntries = useMemo(
    () => resolveResponseOverlayEntries({
      conversationView,
      currentTurnProjection,
      liveTurnPresentationInput,
    }),
    [
      conversationView,
      currentTurnProjection,
      liveTurnPresentationInput,
    ],
  );

  const responseOverlayMessages = useMemo(
    () => (
      useLocalPendingTurn
        ? messages
        : responseOverlayEntries
    ),
    [messages, responseOverlayEntries, useLocalPendingTurn],
  );

  const responseOverlayDismissalTarget = useMemo(() => {
    return resolveResponseOverlayDismissalTarget({
      currentTurnProjection,
      overlayIntent: liveTurnPresentationInput.overlayIntent,
      responseOverlayEntries,
      useSdkLiveTurnPresentation,
    });
  }, [
    currentTurnProjection,
    liveTurnPresentationInput.overlayIntent,
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

  const currentTurnPresentationState = useMemo(
    () => resolveCurrentTurnPresentationState({
      messages: responseOverlayMessages,
      dismissedResponseId,
    }),
    [responseOverlayMessages, dismissedResponseId],
  );

  const resolvedCurrentTurnPresentationState = useMemo(
    () => resolveResponseOverlayPresentationState({
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      liveTurnPresentationInput,
      responseOverlayEntries,
      visibleTurnLifecycle,
    }),
    [
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      liveTurnPresentationInput,
      visibleTurnLifecycle,
      responseOverlayEntries,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages: responseOverlayMessages,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  }), [
    responseOverlayMessages,
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
      conversationView,
      currentTurnProjection,
      pendingTurn,
      visibleTurnLifecycle,
      currentTurnPhase,
      overlayIntent,
      currentTurnPresentationState: resolvedCurrentTurnPresentationState,
      responseOverlayEntries,
      viewIntent,
      useSdkLiveTurnPresentation,
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
    conversationView,
    currentTurnProjection,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
    pendingTurn,
    useLocalPendingTurn,
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
