/**
 * Covers message attachment presentation visibility helpers.
 */

import {
  DesktopMessageAttachmentPresentationRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopMessageAttachmentPresentationRuntime';

describe('desktopMessageAttachmentPresentationRuntime', () => {
  const {
    hasVisibleSdkDisplayAttachments,
  } = DesktopMessageAttachmentPresentationRuntime;

  test('detects complete SDK display attachment descriptors', () => {
    expect(hasVisibleSdkDisplayAttachments({
      attachments: [{
        id: 'attachment-ready',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      }],
    })).toBe(true);

    expect(hasVisibleSdkDisplayAttachments({
      attachments: [{
        id: 'attachment-pending',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      }],
    })).toBe(true);
  });

  test('does not repair malformed or legacy screenshot attachment inputs', () => {
    expect(hasVisibleSdkDisplayAttachments({
      screenshotRef: 'artifact-legacy',
    })).toBe(false);

    expect(hasVisibleSdkDisplayAttachments({
      attachments: [{
        id: ' attachment-ready ',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      }, {
        id: 'missing-ready-source',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
      }],
    })).toBe(false);
  });
});
