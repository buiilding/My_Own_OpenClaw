export type {
  CaptureVisibilityPreparation,
  SurfaceMode,
  SurfacePhase,
  SurfaceTransitionSource,
  ToolSurfacePreparation,
} from './surfaceOrchestrator/types';

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
  resolveToolSurfaceMode,
  shouldSkipToolExecution,
} from './surfaceOrchestrator/mode';

import { resetSurfaceOrchestratorStateForTests } from './surfaceOrchestrator/state';

export function __resetSurfaceOrchestratorStateForTests(): void {
  resetSurfaceOrchestratorStateForTests();
}
