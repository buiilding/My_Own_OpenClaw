import {
  ensureToolExecutionSurface,
  prepareToolExecutionSurface,
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  restoreToolExecutionSurface,
  shouldSkipToolExecution,
  __resetSurfaceOrchestratorStateForTests,
} from '../../../infrastructure/services/SurfaceOrchestrator';

export {
  ensureToolExecutionSurface,
  prepareToolExecutionSurface,
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  restoreToolExecutionSurface,
  shouldSkipToolExecution,
};

export function __resetToolExecutionSurfaceStateForTests(): void {
  __resetSurfaceOrchestratorStateForTests();
}
