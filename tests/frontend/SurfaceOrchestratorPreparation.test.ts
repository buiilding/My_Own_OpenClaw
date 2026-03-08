import { buildToolSurfacePreparation } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/preparation';

describe('surfaceOrchestrator preparation helper', () => {
  test('builds tool surface preparation payload for ready path', () => {
    expect(buildToolSurfacePreparation('interactive', 'corr-1', {
      canExecute: true,
      failureReason: null,
      surfaceToken: 7,
    })).toEqual({
      canExecute: true,
      failureReason: null,
      surfaceToken: 7,
      mode: 'interactive',
      correlationId: 'corr-1',
      hiddenSurface: 'none',
    });
  });

  test('builds tool surface preparation payload for failure path', () => {
    expect(buildToolSurfacePreparation('screenshot', 'corr-2', {
      canExecute: false,
      failureReason: 'overlay_focus_prepare_failed',
      surfaceToken: null,
    })).toEqual({
      canExecute: false,
      failureReason: 'overlay_focus_prepare_failed',
      surfaceToken: null,
      mode: 'screenshot',
      correlationId: 'corr-2',
      hiddenSurface: 'none',
    });
  });
});
