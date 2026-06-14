/**
 * Provides the surface orchestrator module for the renderer UI.
 */

export type { CaptureVisibilityPreparation } from './surfaceOrchestrator/types';

export {
  ensureToolExecutionSurface,
  prepareToolExecutionSurface,
  restoreToolExecutionSurface,
} from './surfaceOrchestrator/toolLifecycle';

export {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  restoreScreenshotCaptureVisibility,
} from './surfaceOrchestrator/captureLifecycle';

export {
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  shouldSkipToolExecution,
} from './surfaceOrchestrator/mode';
