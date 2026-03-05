type SurfacePreparation = {
  canExecute: boolean;
};

type SurfaceLifecycleOptions<TPreparation extends SurfacePreparation> = {
  correlationId: string;
  turnRef: string | null;
  conversationRef: string | null;
  trackExecution: (
    correlationId: string,
    turnRef: string | null,
    conversationRef: string | null,
  ) => void;
  untrackExecution: (correlationId: string) => void;
  prepareSurface: () => Promise<TPreparation>;
  runExecution: () => Promise<void>;
  restoreSurface: (preparation: TPreparation) => Promise<void>;
  onPreparationFailure: (preparation: TPreparation) => Promise<void>;
  onExecutionError: (error: unknown) => void;
};

export async function executeWithSurfaceLifecycle<TPreparation extends SurfacePreparation>(
  options: SurfaceLifecycleOptions<TPreparation>,
): Promise<void> {
  const {
    correlationId,
    turnRef,
    conversationRef,
    trackExecution,
    untrackExecution,
    prepareSurface,
    runExecution,
    restoreSurface,
    onPreparationFailure,
    onExecutionError,
  } = options;

  trackExecution(correlationId, turnRef, conversationRef);
  const preparation = await prepareSurface();

  if (!preparation.canExecute) {
    await onPreparationFailure(preparation);
    untrackExecution(correlationId);
    await restoreSurface(preparation);
    return;
  }

  try {
    await runExecution();
  } catch (error) {
    untrackExecution(correlationId);
    onExecutionError(error);
  } finally {
    await restoreSurface(preparation);
  }
}
