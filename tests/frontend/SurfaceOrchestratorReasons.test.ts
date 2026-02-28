import {
  SURFACE_REASON_CAPTURE_FOCUS_PREPARE_FAILED,
  SURFACE_REASON_CAPTURE_OVERLAP_REUSE,
  SURFACE_REASON_CAPTURE_RESTORE_FAILED,
  SURFACE_REASON_EXTERNAL_FOCUS_NOT_VERIFIED,
  SURFACE_REASON_NO_TRANSITION_NEEDED,
  SURFACE_REASON_OVERLAY_FOCUS_PREPARE_FAILED,
  SURFACE_REASON_PREPARE_CAPTURE_VISIBILITY_FAILED,
  SURFACE_REASON_RESTORE_CHATBOX_FAILED,
  SURFACE_REASON_RESTORE_NOT_REQUIRED,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/reasons';

describe('surfaceOrchestrator reason constants', () => {
  test('exports stable reason strings for tool and capture transitions', () => {
    expect(SURFACE_REASON_NO_TRANSITION_NEEDED).toBe('no_surface_transition_needed');
    expect(SURFACE_REASON_RESTORE_NOT_REQUIRED).toBe('restore_not_required');
    expect(SURFACE_REASON_RESTORE_CHATBOX_FAILED).toBe('restore_chatbox_failed');
    expect(SURFACE_REASON_OVERLAY_FOCUS_PREPARE_FAILED).toBe('overlay_focus_prepare_failed');
    expect(SURFACE_REASON_EXTERNAL_FOCUS_NOT_VERIFIED).toBe('external_window_focus_not_verified');
    expect(SURFACE_REASON_CAPTURE_OVERLAP_REUSE).toBe('capture_overlap_reuse');
    expect(SURFACE_REASON_PREPARE_CAPTURE_VISIBILITY_FAILED).toBe('prepare_capture_visibility_failed');
    expect(SURFACE_REASON_CAPTURE_RESTORE_FAILED).toBe('capture_restore_failed');
    expect(SURFACE_REASON_CAPTURE_FOCUS_PREPARE_FAILED).toBe('capture_focus_prepare_failed');
  });
});
