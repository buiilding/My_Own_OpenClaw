/**
 * Covers surface orchestrator reasons. behavior in the frontend test suite.
 */

import {
  SURFACE_REASON_NO_TRANSITION_NEEDED,
  SURFACE_REASON_RESTORE_CHATBOX_FAILED,
  SURFACE_REASON_RESTORE_NOT_REQUIRED,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/reasons';

describe('surfaceOrchestrator reason constants', () => {
  test('exports stable reason strings for tool and capture transitions', () => {
    expect(SURFACE_REASON_NO_TRANSITION_NEEDED).toBe('no_surface_transition_needed');
    expect(SURFACE_REASON_RESTORE_NOT_REQUIRED).toBe('restore_not_required');
    expect(SURFACE_REASON_RESTORE_CHATBOX_FAILED).toBe('restore_chatbox_failed');
  });
});
