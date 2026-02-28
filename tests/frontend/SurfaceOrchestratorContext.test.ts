import {
  resolveCaptureFocusPreparationWaitMs,
  resolveInteractiveFocusPreparationOptions,
  resolveSurfaceTransitionContext,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/context';
import { resetSurfaceOrchestratorStateForTests } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/state';
import {
  DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS,
  DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS,
  DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/types';

describe('surfaceOrchestrator context helpers', () => {
  beforeEach(() => {
    resetSurfaceOrchestratorStateForTests();
  });

  test('resolves source and trims provided correlation id', () => {
    const context = resolveSurfaceTransitionContext(
      undefined,
      '  corr-1  ',
      'tool-runner',
      'surface',
    );

    expect(context).toEqual({
      source: 'tool-runner',
      correlationId: 'corr-1',
    });
  });

  test('synthesizes deterministic correlation id when missing', () => {
    const first = resolveSurfaceTransitionContext(
      'system-capture',
      '   ',
      'tool-runner',
      'capture',
    );
    const second = resolveSurfaceTransitionContext(
      undefined,
      null,
      'tool-runner',
      'capture',
    );

    expect(first).toEqual({
      source: 'system-capture',
      correlationId: 'capture-1',
    });
    expect(second).toEqual({
      source: 'tool-runner',
      correlationId: 'capture-2',
    });
  });

  test('resolves interactive focus wait/attempt defaults and explicit values', () => {
    expect(resolveInteractiveFocusPreparationOptions(undefined, undefined)).toEqual({
      waitMs: DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS,
      maxAttempts: DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS,
    });

    expect(resolveInteractiveFocusPreparationOptions(250, 7)).toEqual({
      waitMs: 250,
      maxAttempts: 7,
    });
  });

  test('resolves capture focus wait default and explicit value', () => {
    expect(resolveCaptureFocusPreparationWaitMs(undefined)).toBe(DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS);
    expect(resolveCaptureFocusPreparationWaitMs(40)).toBe(40);
  });
});
