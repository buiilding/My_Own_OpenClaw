/**
 * Covers SDK display attachment projection helpers.
 */

import {
  DesktopSdkDisplayAttachmentProjection,
} from '../../frontend/src/renderer/app/runtime/desktopSdkDisplayAttachmentProjection';

const {
  readSdkImageAttachmentSource,
  readSdkDisplayAttachments,
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

  test('reads image source fields only from typed SDK image attachments', () => {
    expect(readSdkImageAttachmentSource({
      id: 'attachment-ready',
      kind: 'image',
      source: 'replay',
      status: 'ready',
      contentType: ' image/png ',
      screenshotRef: ' artifact-ready ',
      screenshotUrl: ' https://cdn.example/ready.png ',
    })).toEqual({
      id: 'attachment-ready',
      status: 'ready',
      artifactId: 'artifact-ready',
      url: 'https://cdn.example/ready.png',
      contentType: 'image/png',
    });
    expect(readSdkImageAttachmentSource({
      id: 'message-row',
      screenshotRef: 'artifact-row-alias',
      screenshotUrl: 'https://cdn.example/row-alias.png',
    })).toBeNull();
    expect(readSdkImageAttachmentSource({
      id: 'attachment-pending',
      kind: 'screenshot_request',
      source: 'camera_button',
      status: 'pending_capture',
    })).toBeNull();
  });

});
