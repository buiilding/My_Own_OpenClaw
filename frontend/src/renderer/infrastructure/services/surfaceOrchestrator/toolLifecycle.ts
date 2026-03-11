import { logSurfaceTransition } from './logging';
import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import {
  resolveSurfaceTransitionContext,
} from './context';
import { buildToolSurfacePreparation } from './preparation';
import {
  SURFACE_REASON_NO_TRANSITION_NEEDED,
  SURFACE_REASON_RESTORE_CHATBOX_FAILED,
  SURFACE_REASON_RESTORE_NOT_REQUIRED,
} from './reasons';
import {
  suppressSurfaceForBackgroundCapture,
  restoreSurfaceAfterBackgroundCapture,
  shouldManageSurfaceVisibilityForBackgroundCapture,
} from './surfaceVisibility';
import {
  handoffSurfaceForComputerUse,
  isDashboardVisibleForComputerUseHandoff,
} from './surfaceHandoff';
import {
  resolveToolSurfaceMode,
  shouldDemoteOverlayForTool,
} from './mode';
import {
  getPendingHiddenSurfaceRestore,
  hasActiveSurfaceTokens,
  isPendingOverlayDemotionRestore,
  registerSurfaceToken,
  releaseSurfaceToken,
  isPendingHiddenSurfaceRestore,
  setPendingOverlayDemotionRestore,
  setPendingHiddenSurfaceRestore,
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
    shouldDemoteOverlay?: boolean;
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
      canExecute: true,
      failureReason: null,
      surfaceToken: null,
    });
  }

  let surfaceToken: number | null = null;
  let overlayDemoted = false;
  const shouldManageSurfaceVisibility = shouldManageSurfaceVisibilityForBackgroundCapture();
  const shouldCollapseForScreenshot = (
    mode === 'screenshot'
    && shouldManageSurfaceVisibility
    && !hasActiveSurfaceTokens()
  );

  try {
    if ((mode === 'interactive' || mode === 'screenshot') && !hasActiveSurfaceTokens()) {
      if (await isDashboardVisibleForComputerUseHandoff()) {
        await handoffSurfaceForComputerUse();
      }
    }

    if (options.shouldDemoteOverlay === true && !hasActiveSurfaceTokens()) {
      const demotionResult = await IpcBridge.invoke(
        INVOKE_CHANNELS.DEMOTE_OVERLAY_TOPMOST_FOR_WINDOW_SWITCH,
        {},
      );
      overlayDemoted = demotionResult?.success === true && demotionResult?.demoted === true;
      if (overlayDemoted) {
        setPendingOverlayDemotionRestore(true);
      }
    }

    if (shouldCollapseForScreenshot) {
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.IDLE,
        phaseAfter: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
      });
      const collapseResult = await suppressSurfaceForBackgroundCapture();
      setPendingHiddenSurfaceRestore(collapseResult.hiddenSurface);
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
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.IDLE,
        phaseAfter: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
      });
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
        phaseAfter: SURFACE_PHASE.INTERACTIVE_READY,
      });
      return buildToolSurfacePreparation(mode, correlationId, {
        canExecute: true,
        failureReason: null,
        surfaceToken,
        hiddenSurface: getPendingHiddenSurfaceRestore() ?? 'none',
        overlayDemoted,
      });
    }

    return buildToolSurfacePreparation(mode, correlationId, {
      canExecute: true,
      failureReason: null,
      surfaceToken,
      hiddenSurface: getPendingHiddenSurfaceRestore() ?? 'none',
      overlayDemoted,
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
      canExecute: false,
      failureReason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
      surfaceToken,
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

  const shouldRestoreSurface = releaseSurfaceToken(preparation.surfaceToken);
  if (!shouldRestoreSurface) {
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
    if (isPendingHiddenSurfaceRestore()) {
      await restoreSurfaceAfterBackgroundCapture(
        getPendingHiddenSurfaceRestore() ?? preparation.hiddenSurface ?? 'none',
      );
      setPendingHiddenSurfaceRestore(null);
    }
    if (isPendingOverlayDemotionRestore()) {
      await IpcBridge.invoke(INVOKE_CHANNELS.RESTORE_OVERLAY_TOPMOST_AFTER_WINDOW_SWITCH, {});
      setPendingOverlayDemotionRestore(false);
    }
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.IDLE,
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore hidden surface after tool execution:', error);
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
  } = {},
): Promise<ToolSurfacePreparation> {
  const mode = resolveToolSurfaceMode(toolName, args);
  return prepareToolExecutionSurface(mode, {
    ...options,
    shouldDemoteOverlay: shouldDemoteOverlayForTool(toolName, args),
  });
}
