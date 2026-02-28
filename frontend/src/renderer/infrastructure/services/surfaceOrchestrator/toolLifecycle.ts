import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import { logSurfaceTransition } from './logging';
import {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
} from './chatPillVisibility';
import { resolveToolSurfaceMode } from './mode';
import {
  hasActiveSurfaceTokens,
  isPendingChatPillRestore,
  markOverlayIgnoreForToken,
  registerSurfaceToken,
  releaseSurfaceToken,
  resolveCorrelationId,
  setPendingChatPillRestore,
  unmarkOverlayIgnoreForToken,
} from './state';
import {
  DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS,
  DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS,
  OVERLAY_SURFACE_PREPARE_EXCEPTION,
  type SurfaceMode,
  type SurfaceTransitionSource,
  type ToolSurfacePreparation,
} from './types';

async function isMainWindowVisible(): Promise<boolean> {
  try {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY);
    return result?.success === true && result?.data?.visible === true;
  } catch (_error) {
    return false;
  }
}

export async function prepareToolExecutionSurface(
  mode: SurfaceMode,
  options: {
    correlationId?: string | null;
    source?: SurfaceTransitionSource;
    focusWaitMs?: number;
    focusMaxAttempts?: number;
  } = {},
): Promise<ToolSurfacePreparation> {
  const source = options.source || 'tool-runner';
  const correlationId = resolveCorrelationId(options.correlationId, 'surface');
  if (mode === 'none') {
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: 'idle',
      phaseAfter: 'idle',
      reason: 'no_surface_transition_needed',
    });
    return {
      restoreChatPillAfterExecution: false,
      canExecute: true,
      failureReason: null,
      surfaceToken: null,
      overlayIgnoreEnabled: false,
      mode,
      correlationId,
    };
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
        phaseBefore: 'idle',
        phaseAfter: 'preparing_capture_visibility',
      });
      await collapseChatPillForBackgroundCapture();
      setPendingChatPillRestore(true);
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: 'preparing_capture_visibility',
        phaseAfter: 'capture_ready',
      });
    }

    surfaceToken = registerSurfaceToken();

    if (mode === 'interactive') {
      const waitMs = typeof options.focusWaitMs === 'number'
        ? options.focusWaitMs
        : DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS;
      const maxAttempts = typeof options.focusMaxAttempts === 'number'
        ? options.focusMaxAttempts
        : DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        logSurfaceTransition({
          source,
          correlationId,
          mode,
          phaseBefore: attempt === 1 ? 'idle' : 'preparing_interactive_focus',
          phaseAfter: 'preparing_interactive_focus',
          attempt,
          maxAttempts,
        });

        const focusPreparation = await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
          waitMs,
        });
        const canVerifyExternalFocus = focusPreparation?.data?.canVerifyExternalFocus === true;
        const externalFocusActive = focusPreparation?.data?.externalFocusActive === true;

        if (focusPreparation?.success === false) {
          const failureReason = typeof focusPreparation?.reason === 'string'
            ? focusPreparation.reason
            : 'overlay_focus_prepare_failed';
          logSurfaceTransition({
            source,
            correlationId,
            mode,
            phaseBefore: 'preparing_interactive_focus',
            phaseAfter: 'failed_terminal',
            attempt,
            maxAttempts,
            reason: failureReason,
          });
          return {
            restoreChatPillAfterExecution: true,
            canExecute: false,
            failureReason,
            surfaceToken,
            overlayIgnoreEnabled,
            mode,
            correlationId,
          };
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
            phaseBefore: 'preparing_interactive_focus',
            phaseAfter: 'interactive_ready',
            attempt,
            maxAttempts,
          });
          return {
            restoreChatPillAfterExecution: true,
            canExecute: true,
            failureReason: null,
            surfaceToken,
            overlayIgnoreEnabled,
            mode,
            correlationId,
          };
        }
      }

      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: 'preparing_interactive_focus',
        phaseAfter: 'failed_terminal',
        reason: 'external_window_focus_not_verified',
      });
      return {
        restoreChatPillAfterExecution: shouldCollapseForScreenshot,
        canExecute: false,
        failureReason: 'external_window_focus_not_verified',
        surfaceToken,
        overlayIgnoreEnabled,
        mode,
        correlationId,
      };
    }

    return {
      restoreChatPillAfterExecution: shouldCollapseForScreenshot,
      canExecute: true,
      failureReason: null,
      surfaceToken,
      overlayIgnoreEnabled,
      mode,
      correlationId,
    };
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare tool execution surface:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: mode === 'interactive' ? 'preparing_interactive_focus' : 'preparing_capture_visibility',
      phaseAfter: 'failed_terminal',
      reason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
    });
    return {
      restoreChatPillAfterExecution: surfaceToken !== null,
      canExecute: false,
      failureReason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
      surfaceToken,
      overlayIgnoreEnabled,
      mode,
      correlationId,
    };
  }
}

export async function restoreToolExecutionSurface(
  preparation: ToolSurfacePreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const source = options.source || 'tool-runner';
  const correlationId = resolveCorrelationId(preparation.correlationId, 'surface-restore');

  logSurfaceTransition({
    source,
    correlationId,
    mode: preparation.mode,
    phaseBefore: 'idle',
    phaseAfter: 'restoring_surface',
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
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
      reason: 'restore_not_required',
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
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after tool execution:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: 'restoring_surface',
      phaseAfter: 'failed_terminal',
      reason: 'restore_chatbox_failed',
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
