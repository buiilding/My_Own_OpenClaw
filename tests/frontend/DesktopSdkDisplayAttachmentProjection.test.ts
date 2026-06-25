/**
 * Covers SDK display attachment projection helpers.
 */

import {
  DesktopSdkDisplayAttachmentProjection,
} from '../../frontend/src/renderer/app/runtime/desktopSdkDisplayAttachmentProjection';

const {
  countDisplayImageAttachments,
  hasReadyDisplayImageAttachment,
  readSdkDisplayAttachments,
  summarizeSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

describe('DesktopSdkDisplayAttachmentProjection', () => {
  test('keeps typed SDK display attachments and drops malformed descriptors', () => {
    expect(readSdkDisplayAttachments([
      {
        id: 'attachment-ready',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      },
      {
        id: 'attachment-pending',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      },
      {
        id: 'legacy-alias',
        screenshotRef: 'artifact-legacy',
      },
      {
        id: 'bad-status',
        kind: 'image',
        source: 'user_included',
        status: 'unknown',
      },
    ])).toEqual([
      expect.objectContaining({
        id: 'attachment-ready',
        status: 'ready',
      }),
      expect.objectContaining({
        id: 'attachment-pending',
        status: 'pending_capture',
      }),
    ]);
  });

  test('returns an empty attachment list for non-array input', () => {
    expect(readSdkDisplayAttachments(null)).toEqual([]);
    expect(readSdkDisplayAttachments({ attachments: [] })).toEqual([]);
  });

  test('centralizes display image counts and ready image checks', () => {
    const attachments = [
      {
        id: 'attachment-ready',
        kind: 'image',
        source: 'replay',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      },
      {
        id: 'attachment-materializing',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'blob:preview',
      },
      {
        id: 'attachment-pending',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      },
    ];

    expect(countDisplayImageAttachments(attachments)).toBe(2);
    expect(hasReadyDisplayImageAttachment(attachments)).toBe(true);
    expect(hasReadyDisplayImageAttachment([attachments[1], attachments[2]])).toBe(false);
  });

  test('summarizes SDK display attachment lifecycle fields without payload aliases', () => {
    expect(summarizeSdkDisplayAttachments([
      {
        id: 'attachment-ready',
        kind: 'image',
        source: 'replay',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      },
      {
        id: 'attachment-materializing',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'blob:preview',
      },
      {
        id: 'attachment-pending',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      },
      {
        id: 'attachment-failed',
        kind: 'image',
        source: 'user_included',
        status: 'failed',
      },
      {
        id: 'legacy-alias',
        screenshotRef: 'artifact-legacy',
      },
    ])).toEqual({
      userAttachmentCount: 4,
      attachmentSources: ['camera_button', 'replay', 'user_included'],
      attachmentStatuses: ['failed', 'materializing', 'pending_capture', 'ready'],
      readyArtifactCount: 1,
      materializingPreviewCount: 1,
      pendingScreenshotRequestCount: 1,
      failedAttachmentCount: 1,
    });
  });
});
