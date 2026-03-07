import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import type { ToolResult } from './MessageFormatter';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from './ArtifactImageUtils';
import { uploadArtifactBase64 } from './ArtifactUploader';
import {
  resolveScreenshotContentType,
  sanitizeCaptureMeta,
} from './CapturePayloadUtils';
import {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  restoreScreenshotCaptureVisibility,
  type CaptureVisibilityPreparation,
} from './SurfaceOrchestrator';
import { logScreenshotCaptureTiming } from './toolExecution/ToolExecutionLogger';

export type CaptureMeta = {
  source_w?: number;
  source_h?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  desktop_virtual_bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  monitor_id?: string | null;
  timestamp?: number;
  capture_backend?: string | null;
};

export type ScreenshotAttachment = {
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
};

type CaptureScreenshotOptions = {
  waitSeconds?: number;
  isFirstUserMessage?: boolean;
  correlationId?: string | null;
  explanation?: string;
};

type MaterializeScreenshotAttachmentOptions = {
  filenameStem: string;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferArtifactRefFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/api\/artifacts\/([^/?#]+)/i);
  return match?.[1] || null;
}

function parseInlineScreenshotPayload(
  payload: string | null,
): { base64: string; contentType: string | null } | null {
  const trimmedPayload = normalizeOptionalString(payload);
  if (!trimmedPayload) {
    return null;
  }
  if (
    trimmedPayload.toLowerCase().startsWith('artifact://')
    || trimmedPayload.toLowerCase().startsWith('http://')
    || trimmedPayload.toLowerCase().startsWith('https://')
  ) {
    return null;
  }

  const dataUrlMatch = trimmedPayload.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      base64: dataUrlMatch[2].trim(),
      contentType: dataUrlMatch[1].toLowerCase(),
    };
  }

  return {
    base64: trimmedPayload,
    contentType: null,
  };
}

function resolveScreenshotExplanation(
  explanation: string | undefined,
  isFirstUserMessage: boolean,
): string {
  if (typeof explanation === 'string' && explanation.trim().length > 0) {
    return explanation.trim();
  }
  return isFirstUserMessage
    ? 'Initial user message screenshot'
    : 'Screenshot capture';
}

export function createEmptyScreenshotAttachment(): ScreenshotAttachment {
  return {
    screenshot: null,
    screenshotRef: null,
    screenshotUrl: null,
    screenshotContentType: null,
    captureMeta: null,
  };
}

export function createInlineScreenshotAttachment({
  screenshot,
  screenshotContentType,
  captureMeta = null,
}: {
  screenshot: string;
  screenshotContentType: string | null;
  captureMeta?: CaptureMeta | null;
}): ScreenshotAttachment {
  const parsedPayload = parseInlineScreenshotPayload(screenshot);
  return {
    ...createEmptyScreenshotAttachment(),
    screenshot: parsedPayload?.base64 || null,
    screenshotContentType: (
      parsedPayload?.contentType
      || normalizeOptionalString(screenshotContentType)
      || null
    ),
    captureMeta,
  };
}

export function buildScreenshotArgs(explanation: string): Record<string, unknown> {
  return {
    explanation,
    expectation: 'Current screen state',
  };
}

export function hasScreenshotAttachment(attachment: ScreenshotAttachment | null | undefined): boolean {
  return Boolean(
    attachment
    && (
      attachment.screenshot
      || attachment.screenshotRef
      || attachment.screenshotUrl
    ),
  );
}

export function extractScreenshotAttachment(result: ToolResult): ScreenshotAttachment {
  if (!result.success || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return createEmptyScreenshotAttachment();
  }

  const parsedInlineScreenshot = (
    parseInlineScreenshotPayload(
      typeof result.data.screenshot === 'string'
        ? result.data.screenshot
        : typeof result.data.image_data === 'string'
          ? result.data.image_data
          : null,
    )
  );
  const screenshotUrl = normalizeOptionalString(result.data.screenshot_url);
  const screenshotRef = (
    normalizeOptionalString(result.data.screenshot_ref)
    || inferArtifactRefFromUrl(screenshotUrl)
  );
  const explicitContentType = (
    normalizeOptionalString(result.data.screenshot_content_type)
    || normalizeOptionalString(result.data.image_content_type)
  );

  return {
    ...createEmptyScreenshotAttachment(),
    screenshot: parsedInlineScreenshot?.base64 || null,
    screenshotRef,
    screenshotUrl,
    screenshotContentType: (
      explicitContentType
      || parsedInlineScreenshot?.contentType
      || resolveScreenshotContentType(result.data)
      || null
    ),
    captureMeta: sanitizeCaptureMeta<CaptureMeta>(result.data.capture_meta),
  };
}

export async function captureScreenshotAttachment({
  waitSeconds = 0,
  isFirstUserMessage = false,
  correlationId = null,
  explanation,
}: CaptureScreenshotOptions = {}): Promise<ScreenshotAttachment> {
  const totalStartTime = performance.now();
  let waitTime = 0;
  let preparationTime = 0;
  let hideInvokeTime = 0;
  let settleTime = 0;
  let focusPrepTime = 0;
  let screenshotInvokeTime = 0;
  let restoreVisibilityTime = 0;
  let screenshotVisibilityPreparation: CaptureVisibilityPreparation = {
    prepared: false,
    captureId: 'capture-uninitialized',
  };
  let attachment = createEmptyScreenshotAttachment();
  const shouldEmitCaptureEvent = typeof window !== 'undefined';
  if (shouldEmitCaptureEvent) {
    window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
      detail: { active: true },
    }));
  }

  try {
    const prepareVisibilityStartTime = performance.now();
    screenshotVisibilityPreparation = await prepareScreenshotCaptureVisibility({
      captureId: correlationId,
      source: 'system-capture',
      waitMs: Math.max(0, waitSeconds) * 1000,
    });
    preparationTime = (performance.now() - prepareVisibilityStartTime) / 1000;
    waitTime = screenshotVisibilityPreparation.timing?.waitTime || 0;
    hideInvokeTime = screenshotVisibilityPreparation.timing?.hideInvokeTime || 0;
    settleTime = screenshotVisibilityPreparation.timing?.settleTime || 0;

    const captureFocusCorrelationId = screenshotVisibilityPreparation.prepared
      ? screenshotVisibilityPreparation.captureId
      : correlationId;

    const focusPrepStartTime = performance.now();
    await prepareExternalFocusForCapture({
      captureId: captureFocusCorrelationId,
      source: 'system-capture',
    });
    focusPrepTime = (performance.now() - focusPrepStartTime) / 1000;

    const screenshotInvokeStartTime = performance.now();
    const screenshotResult = await IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'screenshot',
      args: buildScreenshotArgs(resolveScreenshotExplanation(explanation, isFirstUserMessage)),
      skipAutoCapture: false,
    });
    screenshotInvokeTime = (performance.now() - screenshotInvokeStartTime) / 1000;
    attachment = extractScreenshotAttachment(screenshotResult);
  } catch (error) {
    console.error('[captureScreenshotAttachment] Failed to capture screenshot:', error);
    attachment = createEmptyScreenshotAttachment();
  } finally {
    const restoreVisibilityStartTime = performance.now();
    await restoreScreenshotCaptureVisibility(screenshotVisibilityPreparation, {
      source: 'system-capture',
    });
    restoreVisibilityTime = (performance.now() - restoreVisibilityStartTime) / 1000;
    if (shouldEmitCaptureEvent) {
      window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
        detail: { active: false },
      }));
    }
    logScreenshotCaptureTiming({
      correlationId,
      waitTime,
      preparationTime,
      hideInvokeTime,
      settleTime,
      focusPrepTime,
      screenshotInvokeTime,
      restoreVisibilityTime,
      totalTime: (performance.now() - totalStartTime) / 1000,
    });
  }
  return attachment;
}

export async function materializeScreenshotAttachment(
  attachment: ScreenshotAttachment,
  { filenameStem }: MaterializeScreenshotAttachmentOptions,
): Promise<ScreenshotAttachment> {
  if (!attachment.screenshot) {
    return {
      ...createEmptyScreenshotAttachment(),
      ...attachment,
      screenshotContentType: attachment.screenshotContentType
        ? normalizeArtifactImageContentType(attachment.screenshotContentType)
        : null,
    };
  }

  const normalizedContentType = normalizeArtifactImageContentType(attachment.screenshotContentType);
  const filename = `${filenameStem}.${resolveArtifactImageExtension(normalizedContentType)}`;

  try {
    const uploaded = await uploadArtifactBase64(
      attachment.screenshot,
      normalizedContentType,
      filename,
    );
    return {
      ...createEmptyScreenshotAttachment(),
      ...attachment,
      screenshotRef: uploaded?.artifactId || attachment.screenshotRef || null,
      screenshotUrl: uploaded?.url || attachment.screenshotUrl || null,
      screenshotContentType: uploaded?.contentType || normalizedContentType,
    };
  } catch (error) {
    console.warn('[ScreenshotAttachmentPipeline] Failed to upload screenshot artifact:', error);
    return {
      ...createEmptyScreenshotAttachment(),
      ...attachment,
      screenshotContentType: normalizedContentType,
    };
  }
}

export async function materializeScreenshotAttachments(
  attachments: ScreenshotAttachment[],
  resolveFilenameStem: (index: number, attachment: ScreenshotAttachment) => string,
): Promise<ScreenshotAttachment[]> {
  return await Promise.all(
    attachments.map(async (attachment, index) => (
      materializeScreenshotAttachment(attachment, {
        filenameStem: resolveFilenameStem(index, attachment),
      })
    )),
  );
}

export function resolvePrimaryScreenshotAttachment(
  attachments: Array<Pick<ScreenshotAttachment, 'screenshotRef' | 'screenshotUrl'>>,
): { screenshotRef: string | null; screenshotUrl: string | null } {
  const firstWithRef = attachments.find(
    (attachment) => normalizeOptionalString(attachment.screenshotRef),
  );
  if (firstWithRef) {
    return {
      screenshotRef: normalizeOptionalString(firstWithRef.screenshotRef),
      screenshotUrl: normalizeOptionalString(firstWithRef.screenshotUrl),
    };
  }
  const firstWithUrl = attachments.find(
    (attachment) => normalizeOptionalString(attachment.screenshotUrl),
  );
  return {
    screenshotRef: firstWithUrl
      ? inferArtifactRefFromUrl(normalizeOptionalString(firstWithUrl.screenshotUrl))
      : null,
    screenshotUrl: firstWithUrl
      ? normalizeOptionalString(firstWithUrl.screenshotUrl)
      : null,
  };
}

export function buildScreenshotRefs(
  attachments: Array<Pick<ScreenshotAttachment, 'screenshotRef'>>,
): string[] {
  const refs = new Set<string>();
  for (const attachment of attachments) {
    const normalizedRef = normalizeOptionalString(attachment.screenshotRef);
    if (normalizedRef) {
      refs.add(normalizedRef);
    }
  }
  return Array.from(refs);
}
