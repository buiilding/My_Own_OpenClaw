import {
  resolveSurfaceTransitionContext,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/context';
import { resetSurfaceOrchestratorStateForTests } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/state';

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
});
