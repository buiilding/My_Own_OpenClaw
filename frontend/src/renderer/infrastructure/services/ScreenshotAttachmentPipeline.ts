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
  buildRemoteScreenshotAttachment,
  inferArtifactRefFromUrl,
  resolveScreenshotAttachmentState,
} from './screenshotMessageState';
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

let activeScreenshotCaptureCount = 0;

function emitScreenshotCaptureActive(active: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
    detail: {
      active,
      activeCount: activeScreenshotCaptureCount,
    },
  }));
}

function beginScreenshotCaptureEvent(): void {
  activeScreenshotCaptureCount += 1;
  emitScreenshotCaptureActive(true);
}

function endScreenshotCaptureEvent(): void {
  activeScreenshotCaptureCount = Math.max(0, activeScreenshotCaptureCount - 1);
  if (activeScreenshotCaptureCount === 0) {
    emitScreenshotCaptureActive(false);
  }
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

function createEmptyScreenshotAttachment(): ScreenshotAttachment {
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
  const {
    hasRemoteScreenshot: _hasRemoteScreenshot,
    ...attachmentState
  } = resolveScreenshotAttachmentState({
    screenshot,
    screenshotContentType,
    preserveInlineScreenshotWithRemote: true,
  });
  return {
    ...createEmptyScreenshotAttachment(),
    ...attachmentState,
    captureMeta,
  };
}

function buildScreenshotArgs(explanation: string): Record<string, unknown> {
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

  const {
    hasRemoteScreenshot: _hasRemoteScreenshot,
    ...screenshotAttachment
  } = resolveScreenshotAttachmentState({
    screenshot: (
      typeof result.data.screenshot === 'string'
        ? result.data.screenshot
        : typeof result.data.image_data === 'string'
          ? result.data.image_data
          : null
    ),
    screenshotRef: typeof result.data.screenshot_ref === 'string' ? result.data.screenshot_ref : null,
    screenshotUrl: typeof result.data.screenshot_url === 'string' ? result.data.screenshot_url : null,
    screenshotContentType: (
      typeof result.data.screenshot_content_type === 'string'
        ? result.data.screenshot_content_type
        : typeof result.data.image_content_type === 'string'
          ? result.data.image_content_type
          : null
    ),
    preserveInlineScreenshotWithRemote: true,
  });

  return {
    ...createEmptyScreenshotAttachment(),
    ...screenshotAttachment,
    screenshotContentType: screenshotAttachment.screenshotContentType || resolveScreenshotContentType(result.data) || null,
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
    beginScreenshotCaptureEvent();
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
    const screenshotResult = await IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.CAPTURE_SCREENSHOT_ATTACHMENT, {
      args: buildScreenshotArgs(resolveScreenshotExplanation(explanation, isFirstUserMessage)),
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
      endScreenshotCaptureEvent();
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
  const firstWithRef = attachments.find((attachment) => (
    buildRemoteScreenshotAttachment(attachment.screenshotRef, attachment.screenshotUrl).screenshotRef
  ));
  if (firstWithRef) {
    return buildRemoteScreenshotAttachment(firstWithRef.screenshotRef, firstWithRef.screenshotUrl);
  }
  const firstWithUrl = attachments.find((attachment) => (
    buildRemoteScreenshotAttachment(attachment.screenshotRef, attachment.screenshotUrl).screenshotUrl
  ));
  return {
    screenshotRef: firstWithUrl
      ? inferArtifactRefFromUrl(buildRemoteScreenshotAttachment(
        firstWithUrl.screenshotRef,
        firstWithUrl.screenshotUrl,
      ).screenshotUrl)
      : null,
    screenshotUrl: firstWithUrl
      ? buildRemoteScreenshotAttachment(firstWithUrl.screenshotRef, firstWithUrl.screenshotUrl).screenshotUrl
      : null,
  };
}

export function buildScreenshotRefs(
  attachments: Array<Pick<ScreenshotAttachment, 'screenshotRef'>>,
): string[] {
  const refs = new Set<string>();
  for (const attachment of attachments) {
    const normalizedRef = buildRemoteScreenshotAttachment(attachment.screenshotRef, null).screenshotRef;
    if (normalizedRef) {
      refs.add(normalizedRef);
    }
  }
  return Array.from(refs);
}
