import { buildToolSurfacePreparation } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/preparation';

describe('surfaceOrchestrator preparation helper', () => {
  test('builds tool surface preparation payload for ready path', () => {
    expect(buildToolSurfacePreparation('interactive', 'corr-1', {
      restoreChatPillAfterExecution: true,
      canExecute: true,
      failureReason: null,
      surfaceToken: 7,
      overlayIgnoreEnabled: true,
      overlayNonFocusableEnabled: true,
    })).toEqual({
      restoreChatPillAfterExecution: true,
      canExecute: true,
      failureReason: null,
      surfaceToken: 7,
      overlayIgnoreEnabled: true,
      overlayNonFocusableEnabled: true,
      mode: 'interactive',
      correlationId: 'corr-1',
    });
  });

  test('builds tool surface preparation payload for failure path', () => {
    expect(buildToolSurfacePreparation('screenshot', 'corr-2', {
      restoreChatPillAfterExecution: false,
      canExecute: false,
      failureReason: 'overlay_focus_prepare_failed',
      surfaceToken: null,
      overlayIgnoreEnabled: false,
      overlayNonFocusableEnabled: false,
    })).toEqual({
      restoreChatPillAfterExecution: false,
      canExecute: false,
      failureReason: 'overlay_focus_prepare_failed',
      surfaceToken: null,
      overlayIgnoreEnabled: false,
      overlayNonFocusableEnabled: false,
      mode: 'screenshot',
      correlationId: 'corr-2',
    });
  });
});
