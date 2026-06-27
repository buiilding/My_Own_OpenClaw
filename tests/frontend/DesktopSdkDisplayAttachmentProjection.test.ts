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
      {
        id: 'missing-ready-source',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
      },
      {
        id: 'missing-materializing-preview',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
      },
      {
        id: 'padded-materializing-preview',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: ' data:image/png;base64,padded ',
      },
      {
        id: 'image-pending',
        kind: 'image',
        source: 'camera_button',
        status: 'pending_capture',
      },
      {
        id: 'ready-screenshot-request',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'ready',
      },
      {
        id: 'tool-screenshot-request',
        kind: 'screenshot_request',
        source: 'tool_result',
        status: 'pending_capture',
      },
      {
        id: ' padded-id ',
        kind: 'image',
        source: 'replay',
        status: 'ready',
        screenshotRef: 'artifact-padded-id',
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
      contentType: 'image/png',
      screenshotRef: 'artifact-ready',
      screenshotUrl: 'https://cdn.example/ready.png',
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

  test('keeps only complete SDK attachment lifecycle descriptors', () => {
    expect(readSdkDisplayAttachments([
      {
        id: 'image-preview',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,preview',
      },
      {
        id: 'image-ready-ref',
        kind: 'image',
        source: 'camera_button',
        status: 'ready',
        screenshotRef: 'artifact-ready',
      },
      {
        id: 'image-ready-url',
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        screenshotUrl: 'https://cdn.example/ready.png',
      },
      {
        id: 'image-failed',
        kind: 'image',
        source: 'user_included',
        status: 'failed',
      },
      {
        id: 'request-pending',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'pending_capture',
      },
      {
        id: 'request-materializing',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'materializing',
      },
      {
        id: 'request-failed',
        kind: 'screenshot_request',
        source: 'camera_button',
        status: 'failed',
      },
    ])).toEqual([
      expect.objectContaining({ id: 'image-preview' }),
      expect.objectContaining({ id: 'image-ready-ref' }),
      expect.objectContaining({ id: 'image-ready-url' }),
      expect.objectContaining({ id: 'image-failed' }),
      expect.objectContaining({ id: 'request-pending' }),
      expect.objectContaining({ id: 'request-materializing' }),
      expect.objectContaining({ id: 'request-failed' }),
    ]);
  });

  test('does not repair padded SDK image source fields', () => {
    expect(readSdkImageAttachmentSource({
      id: 'attachment-ready',
      kind: 'image',
      source: 'replay',
      status: 'ready',
      contentType: ' image/png ',
      screenshotRef: ' artifact-ready ',
      screenshotUrl: ' https://cdn.example/ready.png ',
    })).toBeNull();
    expect(readSdkImageAttachmentSource({
      id: 'attachment-ready',
      kind: 'image',
      source: 'replay',
      status: 'ready',
      contentType: ' image/png ',
      screenshotRef: 'artifact-ready',
      screenshotUrl: ' https://cdn.example/ready.png ',
    })).toEqual({
      id: 'attachment-ready',
      status: 'ready',
      artifactId: 'artifact-ready',
      url: null,
      contentType: null,
    });
    expect(readSdkImageAttachmentSource({
      id: ' attachment-ready ',
      kind: 'image',
      source: 'replay',
      status: 'ready',
      screenshotRef: 'artifact-ready',
    })).toBeNull();
  });

});
