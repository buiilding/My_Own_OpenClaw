import { logSurfaceTransition } from './logging';
import {
  resolveSurfaceTransitionContext,
} from './context';
import {
  collapseChatPillForBackgroundCapture,
  restoreChatPillInactive,
  shouldManageChatPillVisibilityForBackgroundCapture,
} from './chatPillVisibility';
import {
  decrementActiveScreenshotCaptureCount,
  getActiveScreenshotCaptureCount,
  incrementActiveScreenshotCaptureCount,
  isPendingChatPillRestore,
  isPendingScreenshotCaptureRestore,
  setPendingChatPillRestore,
  setPendingScreenshotCaptureRestore,
} from './state';
import {
  SURFACE_REASON_CAPTURE_OVERLAP_REUSE,
  SURFACE_REASON_CAPTURE_RESTORE_FAILED,
  SURFACE_REASON_NO_TRANSITION_NEEDED,
  SURFACE_REASON_PREPARE_CAPTURE_VISIBILITY_FAILED,
} from './reasons';
import {
  SURFACE_PHASE,
  type CaptureVisibilityPreparation,
  type SurfaceTransitionSource,
} from './types';

export async function prepareScreenshotCaptureVisibility(
  options: {
    captureId?: string | null;
    source?: SurfaceTransitionSource;
    waitMs?: number;
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
  const shouldManageChatPillVisibility = shouldManageChatPillVisibilityForBackgroundCapture();
  const shouldRestoreChatPillAfterCapture = (
    shouldManageChatPillVisibility
    && !isPendingChatPillRestore()
  );
  const waitMs = typeof options.waitMs === 'number' ? Math.max(0, options.waitMs) : 0;

  if (!shouldManageChatPillVisibility) {
    const collapseResult = await collapseChatPillForBackgroundCapture({ waitMs });
    return {
      prepared: true,
      captureId,
      restoreChatPillAfterCapture: false,
      timing: collapseResult.timing,
    };
  }

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
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
    };
  }

  try {
    if (!shouldRestoreChatPillAfterCapture) {
      // Nested screenshot captures can run while an outer screenshot surface already
      // collapsed the chat pill. Mark restore pending so this capture still guarantees
      // re-show after screenshot completion.
      setPendingScreenshotCaptureRestore(true);
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
        timing: {
          waitTime: 0,
          hideInvokeTime: 0,
          settleTime: 0,
        },
      };
    }

    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: SURFACE_PHASE.IDLE,
      phaseAfter: SURFACE_PHASE.PREPARING_CAPTURE_VISIBILITY,
    });
    const collapseResult = await collapseChatPillForBackgroundCapture({ waitMs });
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
      timing: collapseResult.timing,
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
      timing: {
        waitTime: 0,
        hideInvokeTime: 0,
        settleTime: 0,
      },
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
  if (!shouldManageChatPillVisibilityForBackgroundCapture()) {
    return;
  }

  decrementActiveScreenshotCaptureCount();
  if (
    getActiveScreenshotCaptureCount() > 0
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
    if (!shouldRestoreChatPillAfterCapture) {
      setPendingChatPillRestore(false);
    }
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
  logSurfaceTransition({
    source,
    correlationId: captureId,
    mode: 'screenshot',
    phaseBefore: SURFACE_PHASE.CAPTURE_READY,
    phaseAfter: SURFACE_PHASE.CAPTURE_READY,
    reason: SURFACE_REASON_NO_TRANSITION_NEEDED,
  });
}
