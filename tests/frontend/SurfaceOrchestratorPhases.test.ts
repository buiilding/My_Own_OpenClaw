import { SURFACE_PHASE } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/types';

describe('surfaceOrchestrator phase constants', () => {
  test('exports stable phase names used by transition logs', () => {
    expect(SURFACE_PHASE).toEqual({
      IDLE: 'idle',
      PREPARING_INTERACTIVE_FOCUS: 'preparing_interactive_focus',
      INTERACTIVE_READY: 'interactive_ready',
      PREPARING_CAPTURE_VISIBILITY: 'preparing_capture_visibility',
      CAPTURE_READY: 'capture_ready',
      RESTORING_SURFACE: 'restoring_surface',
      FAILED_TERMINAL: 'failed_terminal',
    });
  });
});
