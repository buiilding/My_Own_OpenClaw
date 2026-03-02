import {
  resolveSurfaceTransitionContext,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/context';

describe('surfaceOrchestrator context helpers', () => {
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

    expect(first.source).toBe('system-capture');
    expect(second.source).toBe('tool-runner');
    expect(first.correlationId).toMatch(/^capture-\d+$/);
    expect(second.correlationId).toMatch(/^capture-\d+$/);
    expect(second.correlationId).not.toBe(first.correlationId);
  });
});
