/**
 * Provides the use current turn presentation state module for the renderer UI.
 */

import { useMemo } from 'react';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';

const {
  findLatestVisibleAssistantReply,
  resolveCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;

export function useCurrentTurnPresentationState({
  messages,
  dismissedResponseId = null,
  allowedTypes,
}) {
  const activeResponse = useMemo(() => findLatestVisibleAssistantReply(
    messages,
    allowedTypes,
  ), [
    allowedTypes,
    messages,
  ]);

  return useMemo(() => resolveCurrentTurnPresentationState({
    messages,
    dismissedResponseId,
    allowedTypes,
    activeResponse,
  }), [
    allowedTypes,
    activeResponse,
    dismissedResponseId,
    messages,
  ]);
}
