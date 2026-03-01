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
  hasActiveSurfaceTokens,
  decrementActiveScreenshotCaptureCount,
  getActiveScreenshotCaptureCount,
  incrementActiveScreenshotCaptureCount,
  isPendingScreenshotCaptureRestore,
  setPendingScreenshotCaptureRestore,
} from './state';
import {
  SURFACE_REASON_CAPTURE_FOCUS_PREPARE_FAILED,
  SURFACE_REASON_CAPTURE_OVERLAP_REUSE,
  SURFACE_REASON_CAPTURE_RESTORE_FAILED,
  SURFACE_REASON_PREPARE_CAPTURE_VISIBILITY_FAILED,
} from './reasons';
import {
  SURFACE_PHASE,
  type CaptureVisibilityPreparation,
  type SurfaceTransitionSource,
} from './types';
import { prepareOverlayToolFocus } from './focusPreparation';

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
  const shouldRestoreChatPillAfterCapture = !hasActiveSurfaceTokens();

  const activeCaptureCount = incrementActiveScreenshotCaptureCount();
  if (activeCaptureCount > 1) {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.CAPTURE_READY,
      phaseAfter: SURFACE_PHASE.CAPTURE_READY,
      reason: SURFACE_REASON_CAPTURE_OVERLAP_REUSE,
    });
    return {
      prepared: true,
      captureId,
      restoreChatPillAfterCapture: shouldRestoreChatPillAfterCapture,
    };
  }

  try {
    if (!shouldRestoreChatPillAfterCapture) {
      logSurfaceTransition({
        source,
        correlationId: captureId,
        mode: 'screenshot',
        phaseBefore: SURFACE_PHASE.IDLE,
        phaseAfter: SURFACE_PHASE.CAPTURE_READY,
      });
      return {
        prepared: true,
        captureId,
        restoreChatPillAfterCapture: false,
      };
    }

    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.IDLE,
      phaseAfter: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
    });
    await collapseChatPillForBackgroundCapture();
    setPendingScreenshotCaptureRestore(true);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
      phaseAfter: SURFACE_PHASE.CAPTURE_READY,
    });
    return {
      prepared: true,
      captureId,
      restoreChatPillAfterCapture: true,
    };
  } catch (error) {
    decrementActiveScreenshotCaptureCount();
    console.warn('[SurfaceOrchestrator] Failed to hide chat pill before screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
      phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
      reason: SURFACE_REASON_PREPARE_CAPTURE_VISIBILITY_FAILED,
    });
    return {
      prepared: false,
      captureId,
      restoreChatPillAfterCapture: false,
    };
  }
}

export async function restoreScreenshotCaptureVisibility(
  preparation: CaptureVisibilityPreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const shouldRestoreChatPillAfterCapture = preparation.restoreChatPillAfterCapture !== false;
  const context = resolveSurfaceTransitionContext(
    options.source,
    preparation.captureId,
    'system-capture',
    'capture-restore',
  );
  const source = context.source;
  const captureId = context.correlationId;
  if (!preparation.prepared) {
    return;
  }

  decrementActiveScreenshotCaptureCount();
  if (
    getActiveScreenshotCaptureCount() > 0
    || !shouldRestoreChatPillAfterCapture
    || !isPendingScreenshotCaptureRestore()
  ) {
    return;
  }

  logSurfaceTransition({
    source,
    correlationId: captureId,
    mode: 'screenshot',
    phaseBefore: SURFACE_PHASE.CAPTURE_READY,
    phaseAfter: SURFACE_PHASE.RESTORING_SURFACE,
  });

  try {
    await restoreChatPillInactive();
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
      reason: SURFACE_REASON_CAPTURE_RESTORE_FAILED,
    });
  } finally {
    setPendingScreenshotCaptureRestore(false);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.RESTORING_SURFACE,
      phaseAfter: SURFACE_PHASE.IDLE,
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
      phaseBefore: SURFACE_PHASE.CAPTURE_READY,
      phaseAfter: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
    });
    await prepareOverlayToolFocus(waitMs, { skipDemotion: true });
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
      phaseAfter: SURFACE_PHASE.CAPTURE_READY,
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare external focus before capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.PREPARING_INTERACTIVE_FOCUS,
      phaseAfter: SURFACE_PHASE.FAILED_TERMINAL,
      reason: SURFACE_REASON_CAPTURE_FOCUS_PREPARE_FAILED,
    });
  }
}
