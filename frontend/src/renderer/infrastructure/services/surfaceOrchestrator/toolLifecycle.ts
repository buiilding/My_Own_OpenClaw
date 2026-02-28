import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import { logSurfaceTransition } from './logging';
import {
  resolveInteractiveFocusPreparationOptions,
  resolveSurfaceTransitionContext,
} from './context';
import { buildToolSurfacePreparation } from './preparation';
import { isMainWindowVisible } from './windowVisibility';
import {
  SURFACE_REASON_EXTERNAL_FOCUS_NOT_VERIFIED,
  SURFACE_REASON_NO_TRANSITION_NEEDED,
  SURFACE_REASON_OVERLAY_FOCUS_PREPARE_FAILED,
  SURFACE_REASON_RESTORE_CHATBOX_FAILED,
  SURFACE_REASON_RESTORE_NOT_REQUIRED,
} from './reasons';
import {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
} from './chatPillVisibility';
import { prepareOverlayToolFocus } from './focusPreparation';
import { resolveToolSurfaceMode } from './mode';
import {
  hasActiveSurfaceTokens,
  isPendingChatPillRestore,
  markOverlayIgnoreForToken,
  registerSurfaceToken,
  releaseSurfaceToken,
  setPendingChatPillRestore,
  unmarkOverlayIgnoreForToken,
} from './state';
import {
  OVERLAY_SURFACE_PREPARE_EXCEPTION,
  SURFACE_PHASE,
  type SurfaceMode,
  type SurfaceTransitionSource,
  type ToolSurfacePreparation,
} from './types';

export async function prepareToolExecutionSurface(
  mode: SurfaceMode,
  options: {
    correlationId?: string | null;
    source?: SurfaceTransitionSource;
    focusWaitMs?: number;
    focusMaxAttempts?: number;
  } = {},
): Promise<ToolSurfacePreparation> {
  const context = resolveSurfaceTransitionContext(
    options.source,
    options.correlationId,
    'tool-runner',
    'surface',
  );
  const { source, correlationId } = context;
  if (mode === 'none') {
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: SURFACE_PHASE.IDLE,
      phaseAfter: SURFACE_PHASE.IDLE,
      reason: SURFACE_REASON_NO_TRANSITION_NEEDED,
    });
    return buildToolSurfacePreparation(mode, correlationId, {
      restoreChatPillAfterExecution: false,
      canExecute: true,
      failureReason: null,
      surfaceToken: null,
      overlayIgnoreEnabled: false,
    });
  }

  let surfaceToken: number | null = null;
  let overlayIgnoreEnabled = false;
  const shouldCollapseForScreenshot = (
    mode === 'screenshot'
    && !hasActiveSurfaceTokens()
    && await isMainWindowVisible()
  );

  try {
    if (shouldCollapseForScreenshot) {
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.IDLE,
        phaseAfter: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
      });
      await collapseChatPillForBackgroundCapture();
      setPendingChatPillRestore(true);
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
        phaseAfter: SURFACE_PHASE.CAPTURE_READY,
      });
    }

    surfaceToken = registerSurfaceToken();

    if (mode === 'interactive') {
      const interactiveFocusOptions = resolveInteractiveFocusPreparationOptions(
        options.focusWaitMs,
        options.focusMaxAttempts,
      );
      const { waitMs, maxAttempts } = interactiveFocusOptions;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        logSurfaceTransition({
          source,
          correlationId,
          mode,
          phaseBefore: attempt === 1
            ? SURFACE_PHASE.IDLE
            : SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
          phaseAfter: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
          attempt,
          maxAttempts,
        });

        const focusPreparation = await prepareOverlayToolFocus(waitMs);
        const canVerifyExternalFocus = focusPreparation.canVerifyExternalFocus;
        const externalFocusActive = focusPreparation.externalFocusActive;

        if (!focusPreparation.success) {
          const failureReason = focusPreparation.reason || SURFACE_REASON_OVERLAY_FOCUS_PREPARE_FAILED;
          logSurfaceTransition({
            source,
            correlationId,
            mode,
            phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
            phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
            attempt,
            maxAttempts,
            reason: failureReason,
          });
          return buildToolSurfacePreparation(mode, correlationId, {
            restoreChatPillAfterExecution: true,
            canExecute: false,
            failureReason,
            surfaceToken,
            overlayIgnoreEnabled,
          });
        }

        if (!canVerifyExternalFocus || externalFocusActive) {
          try {
            const ignoreResult = await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
              ignore: true,
            });
            overlayIgnoreEnabled = ignoreResult?.success !== false;
            if (overlayIgnoreEnabled) {
              markOverlayIgnoreForToken(surfaceToken);
            }
          } catch (error) {
            console.warn('[SurfaceOrchestrator] Failed to enable overlay click-through for tool execution:', error);
          }
          logSurfaceTransition({
            source,
            correlationId,
            mode,
            phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
            phaseAfter: SURFACE_PHASE.INTERACTIVE_READY,
            attempt,
            maxAttempts,
          });
          return buildToolSurfacePreparation(mode, correlationId, {
            restoreChatPillAfterExecution: true,
            canExecute: true,
            failureReason: null,
            surfaceToken,
            overlayIgnoreEnabled,
          });
        }
      }

      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
        phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
        reason: SURFACE_REASON_EXTERNAL_FOCUS_NOT_VERIFIED,
      });
      return buildToolSurfacePreparation(mode, correlationId, {
        restoreChatPillAfterExecution: shouldCollapseForScreenshot,
        canExecute: false,
        failureReason: SURFACE_REASON_EXTERNAL_FOCUS_NOT_VERIFIED,
        surfaceToken,
        overlayIgnoreEnabled,
      });
    }

    return buildToolSurfacePreparation(mode, correlationId, {
      restoreChatPillAfterExecution: shouldCollapseForScreenshot,
      canExecute: true,
      failureReason: null,
      surfaceToken,
      overlayIgnoreEnabled,
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare tool execution surface:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: mode === 'interactive'
        ? SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS
        : SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
      phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
      reason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
    });
    return buildToolSurfacePreparation(mode, correlationId, {
      restoreChatPillAfterExecution: surfaceToken !== null,
      canExecute: false,
      failureReason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
      surfaceToken,
      overlayIgnoreEnabled,
    });
  }
}

export async function restoreToolExecutionSurface(
  preparation: ToolSurfacePreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const context = resolveSurfaceTransitionContext(
    options.source,
    preparation.correlationId,
    'tool-runner',
    'surface-restore',
  );
  const { source, correlationId } = context;

  logSurfaceTransition({
    source,
    correlationId,
    mode: preparation.mode,
    phaseBefore: SURFACE_PHASE.IDLE,
    phaseAfter: SURFACE_PHASE.RESTORING_SURFACE,
  });

  if (preparation.overlayIgnoreEnabled && unmarkOverlayIgnoreForToken(preparation.surfaceToken)) {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, { ignore: false });
    } catch (error) {
      console.warn('[SurfaceOrchestrator] Failed to disable overlay click-through after tool execution:', error);
    }
  }

  const shouldRestoreChatPill = releaseSurfaceToken(preparation.surfaceToken);
  if (!shouldRestoreChatPill || !isPendingChatPillRestore()) {
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.IDLE,
      reason: SURFACE_REASON_RESTORE_NOT_REQUIRED,
    });
    return;
  }

  try {
    await restoreChatPillInactive();
    setPendingChatPillRestore(false);
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.IDLE,
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after tool execution:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
      reason: SURFACE_REASON_RESTORE_CHATBOX_FAILED,
    });
  }
}

export async function ensureToolExecutionSurface(
  toolName: string,
  args: Record<string, unknown> | undefined,
  options: {
    correlationId?: string | null;
    source?: SurfaceTransitionSource;
    focusWaitMs?: number;
    focusMaxAttempts?: number;
  } = {},
): Promise<ToolSurfacePreparation> {
  const mode = resolveToolSurfaceMode(toolName, args);
  return prepareToolExecutionSurface(mode, options);
}
