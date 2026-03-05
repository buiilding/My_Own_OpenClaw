import { executeWithSurfaceLifecycle } from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerSurfaceExecution';

type TestPreparation = {
  canExecute: boolean;
  failureReason: string | null;
};

describe('toolRunnerSurfaceExecution', () => {
  test('tracks, executes, and restores surface on successful execution', async () => {
    const trackExecution = jest.fn();
    const untrackExecution = jest.fn();
    const prepareSurface = jest.fn<Promise<TestPreparation>, []>().mockResolvedValue({
      canExecute: true,
      failureReason: null,
    });
    const runExecution = jest.fn<Promise<void>, []>().mockResolvedValue();
    const restoreSurface = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onPreparationFailure = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onExecutionError = jest.fn();

    await executeWithSurfaceLifecycle({
      correlationId: 'req-success',
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
      trackExecution,
      untrackExecution,
      prepareSurface,
      runExecution,
      restoreSurface,
      onPreparationFailure,
      onExecutionError,
    });

    expect(trackExecution).toHaveBeenCalledWith('req-success', 'turn-1', 'conv-1');
    expect(prepareSurface).toHaveBeenCalledTimes(1);
    expect(runExecution).toHaveBeenCalledTimes(1);
    expect(restoreSurface).toHaveBeenCalledWith({
      canExecute: true,
      failureReason: null,
    });
    expect(onPreparationFailure).not.toHaveBeenCalled();
    expect(onExecutionError).not.toHaveBeenCalled();
    expect(untrackExecution).not.toHaveBeenCalled();
  });

  test('untracks and restores when surface preparation reports cannot execute', async () => {
    const trackExecution = jest.fn();
    const untrackExecution = jest.fn();
    const preparation: TestPreparation = {
      canExecute: false,
      failureReason: 'focus_failed',
    };
    const prepareSurface = jest.fn<Promise<TestPreparation>, []>().mockResolvedValue(preparation);
    const runExecution = jest.fn<Promise<void>, []>().mockResolvedValue();
    const restoreSurface = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onPreparationFailure = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onExecutionError = jest.fn();

    await executeWithSurfaceLifecycle({
      correlationId: 'req-prep-fail',
      turnRef: 'turn-2',
      conversationRef: null,
      trackExecution,
      untrackExecution,
      prepareSurface,
      runExecution,
      restoreSurface,
      onPreparationFailure,
      onExecutionError,
    });

    expect(onPreparationFailure).toHaveBeenCalledWith(preparation);
    expect(untrackExecution).toHaveBeenCalledWith('req-prep-fail');
    expect(runExecution).not.toHaveBeenCalled();
    expect(restoreSurface).toHaveBeenCalledWith(preparation);
    expect(onExecutionError).not.toHaveBeenCalled();
  });

  test('untracks, reports error, and restores when execution throws', async () => {
    const trackExecution = jest.fn();
    const untrackExecution = jest.fn();
    const preparation: TestPreparation = {
      canExecute: true,
      failureReason: null,
    };
    const executionError = new Error('tool failed');
    const prepareSurface = jest.fn<Promise<TestPreparation>, []>().mockResolvedValue(preparation);
    const runExecution = jest.fn<Promise<void>, []>().mockRejectedValue(executionError);
    const restoreSurface = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onPreparationFailure = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onExecutionError = jest.fn();

    await executeWithSurfaceLifecycle({
      correlationId: 'req-run-fail',
      turnRef: null,
      conversationRef: null,
      trackExecution,
      untrackExecution,
      prepareSurface,
      runExecution,
      restoreSurface,
      onPreparationFailure,
      onExecutionError,
    });

    expect(untrackExecution).toHaveBeenCalledWith('req-run-fail');
    expect(onExecutionError).toHaveBeenCalledWith(executionError);
    expect(restoreSurface).toHaveBeenCalledWith(preparation);
  });

  test('propagates preparation exceptions for outer handling', async () => {
    const trackExecution = jest.fn();
    const untrackExecution = jest.fn();
    const prepareError = new Error('prepare exploded');
    const prepareSurface = jest.fn<Promise<TestPreparation>, []>().mockRejectedValue(prepareError);
    const runExecution = jest.fn<Promise<void>, []>().mockResolvedValue();
    const restoreSurface = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onPreparationFailure = jest.fn<Promise<void>, [TestPreparation]>().mockResolvedValue();
    const onExecutionError = jest.fn();

    await expect(executeWithSurfaceLifecycle({
      correlationId: 'req-prepare-throw',
      turnRef: 'turn-3',
      conversationRef: 'conv-3',
      trackExecution,
      untrackExecution,
      prepareSurface,
      runExecution,
      restoreSurface,
      onPreparationFailure,
      onExecutionError,
    })).rejects.toThrow('prepare exploded');

    expect(untrackExecution).not.toHaveBeenCalled();
    expect(runExecution).not.toHaveBeenCalled();
    expect(restoreSurface).not.toHaveBeenCalled();
  });
});
