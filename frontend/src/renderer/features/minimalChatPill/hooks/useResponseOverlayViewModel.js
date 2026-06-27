/**
 * Provides the use response overlay view model module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import { useChatStore } from '../../chat/stores/chatStore';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import {
  DesktopResponseOverlayViewRuntime,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';
import { DesktopChatPillSessionRuntime } from '../../../app/runtime/desktopChatPillSessionRuntime';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';

const {
  buildRendererOverlayIntentTraceEvent,
  buildRendererOverlayTypingTraceEvent,
  buildRendererOverlayViewModelTraceSignature,
  buildRendererOverlayViewModelTracePayload,
  logRendererOverlayViewModelTrace,
  logRendererOverlayViewModelResolvedTrace,
} = DesktopRendererTraceRuntime;

const {
  resolveCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  buildDismissResponseOverlayAction,
  buildResponseOverlayEntrySignature,
  resolveDismissedResponseOverlayEntryId,
  resolveLatestSourceTaggedResponseOverlayEntry,
  resolveResponseOverlayCloseable,
  resolveResponseOverlayPresentationStateForSurfaceState,
  resolveResponseOverlaySurfaceState,
} = DesktopResponseOverlayViewRuntime;
const {
  resolveChatPillViewIntent,
} = DesktopChatPillSessionRuntime;

export function useResponseOverlayViewModel({
  chatSurfaceState = null,
}) {
  const responseOverlaySurfaceState = useMemo(
    () => resolveResponseOverlaySurfaceState({ chatSurfaceState }),
    [chatSurfaceState],
  );
  const {
    currentTurnPhase,
    pendingTurn,
    responseOverlayDismissalTarget,
    responseOverlayEntries,
    responseOverlayMessages,
    thinkingText,
    useLocalPendingTurn,
    useSdkLiveTurnPresentation,
    visibleTurnLifecycle,
  } = responseOverlaySurfaceState;
  const dismissedResponseOverlayEntries = useChatStore(
    (state) => state.dismissedResponseOverlayEntries,
  );
  const dismissResponseOverlayEntry = useChatStore(
    (state) => state.dismissResponseOverlayEntry,
  );
  const lastResolvedTraceSignatureRef = useRef(null);
  const lastTypingVisibleRef = useRef(null);
  const lastOverlayIntentModeRef = useRef(null);

  const dismissedResponseId = useMemo(() => {
    return resolveDismissedResponseOverlayEntryId({
      dismissedResponseOverlayEntries,
    }, responseOverlayDismissalTarget);
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
    () => resolveResponseOverlayPresentationStateForSurfaceState({
      currentTurnPresentationState,
      dismissedResponseId,
      responseOverlaySurfaceState,
    }),
    [
      currentTurnPresentationState,
      dismissedResponseId,
      responseOverlaySurfaceState,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    dismissedResponseId,
    overlayIntent: resolvedCurrentTurnPresentationState.overlayIntent ?? null,
    pendingTurn,
    responseOverlayEntries,
    visibleTurnLifecycle,
  }), [
    dismissedResponseId,
    pendingTurn,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
    visibleTurnLifecycle,
  ]);

  const latestSourceTaggedResponseEntry = useMemo(
    () => resolveLatestSourceTaggedResponseOverlayEntry({
      responseOverlayEntries,
    }),
    [responseOverlayEntries],
  );

  const responseEntrySignature = useMemo(
    () => buildResponseOverlayEntrySignature({
      responseOverlayEntries,
    }),
    [responseOverlayEntries],
  );

  const responseIsCloseable = useMemo(
    () => resolveResponseOverlayCloseable({
      isBusy: resolvedCurrentTurnPresentationState.isBusy,
      latestSourceTaggedResponseEntry,
      responseOverlayEntries,
      responseVisible: viewIntent.responseVisible,
    }),
    [
      resolvedCurrentTurnPresentationState.isBusy,
      latestSourceTaggedResponseEntry,
      responseOverlayEntries,
      viewIntent.responseVisible,
    ],
  );

  useEffect(() => {
    const overlayIntent = resolvedCurrentTurnPresentationState.overlayIntent ?? null;
    const tracePayload = buildRendererOverlayViewModelTracePayload({
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
    const signature = buildRendererOverlayViewModelTraceSignature(tracePayload);
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
    const dismissAction = buildDismissResponseOverlayAction({
      responseOverlayDismissalTarget,
      responseEntryId: viewIntent.latestResponseOverlayEntryId,
    });
    if (!dismissAction) {
      return;
    }
    dismissResponseOverlayEntry(dismissAction.dismissalTarget);
    DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox(
      dismissAction.responseboxDismissalValues,
    ).catch((error) => {
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
    currentTurnPhase,
    thinkingText,
    handleCloseResponse,
    ...viewIntent,
  };
}
