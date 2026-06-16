/**
 * Provides the surface orchestrator module for the renderer UI.
 */

export {
  ensureToolExecutionSurface,
  prepareToolExecutionSurface,
  restoreToolExecutionSurface,
} from './surfaceOrchestrator/toolLifecycle';

export {
  prepareExternalFocusForCapture,
} from './surfaceOrchestrator/captureLifecycle';

export {
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  shouldSkipToolExecution,
} from './surfaceOrchestrator/mode';
