type ScreenshotAttachment = {
  screenshotRef: string | null;
  screenshotUrl: string | null;
};

type UploadedArtifact = {
  artifactId?: string | null;
  url?: string | null;
};

type UploadedScreenshotEntry = {
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
};

type CaptureAttachment = {
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function toUploadedArtifactFromCaptureAttachment(
  captureAttachment: CaptureAttachment | null | undefined,
): UploadedArtifact | null {
  const screenshotRef = normalizeOptionalString(captureAttachment?.screenshotRef);
  const screenshotUrl = normalizeOptionalString(captureAttachment?.screenshotUrl);
  if (!screenshotRef && !screenshotUrl) {
    return null;
  }
  return {
    artifactId: screenshotRef,
    url: screenshotUrl,
  };
}

export function resolvePrimaryScreenshotAttachment(
  uploadedScreenshotEntries: UploadedScreenshotEntry[],
  fallbackAttachment: ScreenshotAttachment,
): ScreenshotAttachment {
  const firstWithRef = uploadedScreenshotEntries.find(
    (entry) => normalizeOptionalString(entry.screenshotRef),
  );
  if (firstWithRef) {
    return {
      screenshotRef: normalizeOptionalString(firstWithRef.screenshotRef),
      screenshotUrl: normalizeOptionalString(firstWithRef.screenshotUrl),
    };
  }
  return {
    screenshotRef: normalizeOptionalString(fallbackAttachment.screenshotRef),
    screenshotUrl: normalizeOptionalString(fallbackAttachment.screenshotUrl),
  };
}

export function buildScreenshotRefs(
  uploadedScreenshotEntries: UploadedScreenshotEntry[],
  primaryScreenshotRef: string | null,
): string[] {
  const dedupedRefs = new Set<string>();
  for (const entry of uploadedScreenshotEntries) {
    const normalizedRef = normalizeOptionalString(entry.screenshotRef);
    if (normalizedRef) {
      dedupedRefs.add(normalizedRef);
    }
  }
  const normalizedPrimaryRef = normalizeOptionalString(primaryScreenshotRef);
  if (normalizedPrimaryRef) {
    dedupedRefs.add(normalizedPrimaryRef);
  }
  return Array.from(dedupedRefs);
}

