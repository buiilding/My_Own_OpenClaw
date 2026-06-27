/**
 * Owns message attachment visibility checks for presentation helpers.
 */

import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';

const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

function hasVisibleSdkDisplayAttachments(message) {
  return readSdkDisplayAttachments(message?.attachments).length > 0;
}

export const DesktopMessageAttachmentPresentationRuntime = Object.freeze({
  hasVisibleSdkDisplayAttachments,
});
