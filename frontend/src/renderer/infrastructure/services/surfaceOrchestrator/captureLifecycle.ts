import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import { logSurfaceTransition } from './logging';
import {
  resolveCaptureFocusPreparationWaitMs,
  resolveSurfaceTransitionContext,
} from './context';
import {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
} from './chatPillVisibility';
import {
  decrementActiveScreenshotCaptureCount,
  getActiveScreenshotCaptureCount,
  incrementActiveScreenshotCaptureCount,
  isPendingScreenshotCaptureRestore,
  setPendingScreenshotCaptureRestore,
} from './state';
import {
  type CaptureVisibilityPreparation,
  type SurfaceTransitionSource,
} from './types';

export async function prepareScreenshotCaptureVisibility(
  options: {
    captureId?: string | null;
    source?: SurfaceTransitionSource;
  } = {},
): Promise<CaptureVisibilityPreparation> {
  const context = resolveSurfaceTransitionContext(
    options.source,
    options.captureId,
    'system-capture',
    'capture',
  );
  const source = context.source;
  const captureId = context.correlationId;

  const activeCaptureCount = incrementActiveScreenshotCaptureCount();
  if (activeCaptureCount > 1) {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'capture_ready',
      phaseAfter: 'capture_ready',
      reason: 'capture_overlap_reuse',
    });
    return { prepared: true, captureId };
  }

  try {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'idle',
      phaseAfter: 'preparing_capture_visibility',
    });
    await collapseChatPillForBackgroundCapture();
    setPendingScreenshotCaptureRestore(true);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_capture_visibility',
      phaseAfter: 'capture_ready',
    });
    return { prepared: true, captureId };
  } catch (error) {
    decrementActiveScreenshotCaptureCount();
    console.warn('[SurfaceOrchestrator] Failed to hide chat pill before screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_capture_visibility',
      phaseAfter: 'failed_terminal',
      reason: 'prepare_capture_visibility_failed',
    });
    return { prepared: false, captureId };
  }
}

export async function restoreScreenshotCaptureVisibility(
  preparation: CaptureVisibilityPreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const source = options.source || 'system-capture';
  if (!preparation.prepared) {
    return;
  }

  decrementActiveScreenshotCaptureCount();
  if (getActiveScreenshotCaptureCount() > 0 || !isPendingScreenshotCaptureRestore()) {
    return;
  }

  logSurfaceTransition({
    source,
    correlationId: preparation.captureId,
    mode: 'screenshot',
    phaseBefore: 'capture_ready',
    phaseAfter: 'restoring_surface',
  });

  try {
    await restoreChatPillInactive();
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: preparation.captureId,
      mode: 'screenshot',
      phaseBefore: 'restoring_surface',
      phaseAfter: 'failed_terminal',
      reason: 'capture_restore_failed',
    });
  } finally {
    setPendingScreenshotCaptureRestore(false);
    logSurfaceTransition({
      source,
      correlationId: preparation.captureId,
      mode: 'screenshot',
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
    });
  }
}

export async function prepareExternalFocusForCapture(
  options: {
    captureId?: string | null;
    waitMs?: number;
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const context = resolveSurfaceTransitionContext(
    options.source,
    options.captureId,
    'system-capture',
    'capture-focus',
  );
  const source = context.source;
  const captureId = context.correlationId;
  const waitMs = resolveCaptureFocusPreparationWaitMs(options.waitMs);

  try {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'capture_ready',
      phaseAfter: 'preparing_interactive_focus',
    });
    await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs,
    });
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_interactive_focus',
      phaseAfter: 'capture_ready',
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare external focus before capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_interactive_focus',
      phaseAfter: 'failed_terminal',
      reason: 'capture_focus_prepare_failed',
    });
  }
}
