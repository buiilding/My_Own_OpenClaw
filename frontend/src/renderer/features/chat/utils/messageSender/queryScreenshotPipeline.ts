import { extractOSstate, type CaptureMeta } from '../../../../infrastructure/services/SystemCapture';
import { uploadArtifactBase64 } from '../../../../infrastructure/services/ArtifactUploader';
import { normalizeArtifactImageContentType } from '../../../../infrastructure/services/ArtifactImageUtils';
import {
  buildScreenshotRefs,
  resolvePrimaryScreenshotAttachment,
  toUploadedArtifactFromCaptureAttachment,
} from '../screenshotAttachmentContract';
import {
  buildArtifactUploadMeta,
  toScreenshotAttachment,
} from './chatMessageSenderUtils';
import type { ClipboardImagePayload } from './chatMessageSenderPayloads';

type UploadedArtifact = { artifactId?: string | null; url?: string | null } | null;

export type UploadedScreenshotEntry = {
  screenshot: string;
  screenshotContentType: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
};

export type QueryScreenshotArtifacts = {
  captureMeta: CaptureMeta | null;
  uploadedScreenshotEntries: UploadedScreenshotEntry[];
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotRefs: string[];
};

type AutoCaptureAttachment = {
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
};

async function resolveAutoCapturedAttachment(
  shouldCaptureQueryScreenshot: boolean,
  isFirstUserMessage: boolean,
): Promise<AutoCaptureAttachment> {
  if (!shouldCaptureQueryScreenshot) {
    return {
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    };
  }

  try {
    const osStateResult = await extractOSstate(
      true,
      false,
      0,
      isFirstUserMessage,
    );

    return {
      screenshot: osStateResult.screenshot,
      screenshotRef: osStateResult.screenshotRef || null,
      screenshotUrl: osStateResult.screenshotUrl || null,
      screenshotContentType: osStateResult.screenshotContentType,
      captureMeta: osStateResult.captureMeta,
    };
  } catch (error) {
    console.error('[queryScreenshotPipeline] Failed to extract OS state:', error);
    return {
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    };
  }
}

async function uploadClipboardImageArtifacts(
  clipboardImages: ClipboardImagePayload[],
): Promise<UploadedArtifact[]> {
  const uploadedArtifacts: UploadedArtifact[] = [];

  for (const clipboardImage of clipboardImages) {
    const artifactUploadMeta = buildArtifactUploadMeta(clipboardImage.contentType);
    try {
      const uploaded = await uploadArtifactBase64(
        clipboardImage.base64,
        artifactUploadMeta.contentType,
        clipboardImage.filename || artifactUploadMeta.filename,
      );
      uploadedArtifacts.push(uploaded || null);
    } catch (error) {
      console.warn('[queryScreenshotPipeline] Failed to upload screenshot artifact:', error);
      uploadedArtifacts.push(null);
    }
  }

  return uploadedArtifacts;
}

async function uploadSingleScreenshotArtifact(
  screenshot: string,
  screenshotContentType: string | null,
  screenshotFilename: string | null,
): Promise<UploadedArtifact[]> {
  const artifactUploadMeta = buildArtifactUploadMeta(screenshotContentType);
  try {
    const uploaded = await uploadArtifactBase64(
      screenshot,
      artifactUploadMeta.contentType,
      screenshotFilename || artifactUploadMeta.filename,
    );
    return [uploaded || null];
  } catch (error) {
    console.warn('[queryScreenshotPipeline] Failed to upload screenshot artifact:', error);
    return [null];
  }
}

function buildUploadedScreenshotEntries(
  clipboardImages: ClipboardImagePayload[],
  uploadedArtifacts: UploadedArtifact[],
): UploadedScreenshotEntry[] {
  return clipboardImages.map((clipboardImage, index) => {
    const attachment = toScreenshotAttachment(uploadedArtifacts[index] || null);
    return {
      screenshot: clipboardImage.base64,
      screenshotContentType: normalizeArtifactImageContentType(clipboardImage.contentType),
      screenshotRef: attachment.screenshotRef,
      screenshotUrl: attachment.screenshotUrl,
    };
  });
}

export async function resolveQueryScreenshotArtifacts({
  clipboardImages,
  shouldCaptureQueryScreenshot,
  isFirstUserMessage,
}: {
  clipboardImages: ClipboardImagePayload[];
  shouldCaptureQueryScreenshot: boolean;
  isFirstUserMessage: boolean;
}): Promise<QueryScreenshotArtifacts> {
  const firstClipboardImage = clipboardImages[0] || null;
  const autoCapturedAttachment = firstClipboardImage
    ? {
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    }
    : await resolveAutoCapturedAttachment(shouldCaptureQueryScreenshot, isFirstUserMessage);

  const fallbackScreenshot = firstClipboardImage?.base64 || autoCapturedAttachment.screenshot;
  const fallbackScreenshotContentType = firstClipboardImage
    ? normalizeArtifactImageContentType(firstClipboardImage.contentType)
    : autoCapturedAttachment.screenshotContentType;
  const screenshotFilename = firstClipboardImage?.filename || null;

  let uploadedArtifacts: UploadedArtifact[] = [];
  if (clipboardImages.length > 0) {
    uploadedArtifacts = await uploadClipboardImageArtifacts(clipboardImages);
  } else if (fallbackScreenshot) {
    uploadedArtifacts = await uploadSingleScreenshotArtifact(
      fallbackScreenshot,
      fallbackScreenshotContentType,
      screenshotFilename,
    );
  } else {
    const captureAttachment = toUploadedArtifactFromCaptureAttachment({
      screenshotRef: autoCapturedAttachment.screenshotRef,
      screenshotUrl: autoCapturedAttachment.screenshotUrl,
    });
    if (captureAttachment) {
      uploadedArtifacts = [captureAttachment];
    }
  }

  const uploadedScreenshotEntries = buildUploadedScreenshotEntries(
    clipboardImages,
    uploadedArtifacts,
  );
  const fallbackAttachment = toScreenshotAttachment(uploadedArtifacts[0] || null);
  const primaryAttachment = resolvePrimaryScreenshotAttachment(
    uploadedScreenshotEntries,
    fallbackAttachment,
  );

  return {
    captureMeta: autoCapturedAttachment.captureMeta,
    uploadedScreenshotEntries,
    screenshotRef: primaryAttachment.screenshotRef,
    screenshotUrl: primaryAttachment.screenshotUrl,
    screenshotRefs: buildScreenshotRefs(uploadedScreenshotEntries, primaryAttachment.screenshotRef),
  };
}
