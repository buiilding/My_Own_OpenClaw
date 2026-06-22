/**
 * Provides the turn input pipeline module for the TypeScript SDK runtime.
 */

import type {
  JsonRecord,
  SdkDisplayAttachment,
  TurnInputResource,
  TurnResourceResolution,
  TurnResourceResolverContext,
  TurnResourceResolverRegistry,
} from '../conversation/types.js';

export type TurnInputResourceResolutionFailure = {
  kind: TurnInputResource['kind'];
  message: string;
  fatal: boolean;
};

export type TurnInputResourceResolutionResult = {
  payload: JsonRecord;
  metadata: JsonRecord;
  failures: TurnInputResourceResolutionFailure[];
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
}

function mergeAttachmentContext(existing: unknown, incoming: unknown): string | null {
  const existingText = optionalString(existing);
  const incomingText = optionalString(incoming);
  if (!incomingText) {
    return existingText;
  }
  if (!existingText) {
    return incomingText;
  }
  return `${existingText}\n\n${incomingText}`;
}

function mergeStringArray(existing: unknown, incoming: unknown): string[] | null {
  const values = new Set([
    ...optionalStringArray(existing),
    ...optionalStringArray(incoming),
  ]);
  return values.size > 0 ? Array.from(values) : null;
}

function normalizeDisplayAttachment(input: unknown): SdkDisplayAttachment | null {
  if (!isJsonRecord(input)) {
    return null;
  }
  const id = optionalString(input.id);
  const kind = input.kind === 'image' || input.kind === 'screenshot_request' ? input.kind : null;
  const source = (
    input.source === 'user_included'
    || input.source === 'camera_button'
    || input.source === 'tool_result'
    || input.source === 'replay'
  ) ? input.source : null;
  const status = (
    input.status === 'materializing'
    || input.status === 'pending_capture'
    || input.status === 'ready'
    || input.status === 'failed'
  ) ? input.status : null;
  if (!id || !kind || !source || !status) {
    return null;
  }
  return {
    id,
    kind,
    source,
    status,
    ...(optionalString(input.filename) ? { filename: optionalString(input.filename) } : {}),
    ...(optionalString(input.contentType) ? { contentType: optionalString(input.contentType) } : {}),
    ...(optionalString(input.screenshotRef) ? { screenshotRef: optionalString(input.screenshotRef) } : {}),
    ...(optionalString(input.screenshotUrl) ? { screenshotUrl: optionalString(input.screenshotUrl) } : {}),
    ...(optionalString(input.errorCode) ? { errorCode: optionalString(input.errorCode) } : {}),
  };
}

function displayAttachmentFailure(resource: TurnInputResource, message: string): SdkDisplayAttachment | null {
  if (resource.kind !== 'clipboard_image' && resource.kind !== 'query_screenshot_request') {
    return null;
  }
  const id = optionalString(resource.displayAttachmentId);
  if (!id) {
    return null;
  }
  return {
    id,
    kind: resource.kind === 'query_screenshot_request' ? 'screenshot_request' : 'image',
    source: resource.kind === 'query_screenshot_request' ? 'camera_button' : 'user_included',
    status: 'failed',
    ...(resource.kind === 'clipboard_image' && optionalString(resource.filename)
      ? { filename: optionalString(resource.filename) }
      : {}),
    ...(resource.kind === 'clipboard_image' && optionalString(resource.contentType)
      ? { contentType: optionalString(resource.contentType) }
      : {}),
    errorCode: message.trim() ? 'resource_resolution_failed' : 'resource_resolution_failed',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown turn resource resolution error';
}

function applyResolution(target: JsonRecord, resolution: TurnResourceResolution): void {
  const attachmentContext = mergeAttachmentContext(
    target.attachment_context,
    resolution.attachmentContext,
  );
  if (attachmentContext) {
    target.attachment_context = attachmentContext;
  }

  const attachmentFilenames = mergeStringArray(
    target.attachment_filenames,
    resolution.attachmentFilenames,
  );
  if (attachmentFilenames) {
    target.attachment_filenames = attachmentFilenames;
  }

  const screenshotRef = optionalString(resolution.screenshotRef);
  if (screenshotRef) {
    target.screenshot_ref = screenshotRef;
  }

  const screenshotUrl = optionalString(resolution.screenshotUrl);
  if (screenshotUrl) {
    target.screenshot_url = screenshotUrl;
  }

  const screenshotRefs = mergeStringArray(
    target.screenshot_refs,
    resolution.screenshotRefs,
  );
  if (screenshotRefs) {
    target.screenshot_refs = screenshotRefs;
  }

  if (isJsonRecord(resolution.captureMeta)) {
    target.capture_meta = {
      ...(isJsonRecord(target.capture_meta) ? target.capture_meta : {}),
      ...resolution.captureMeta,
    };
  }

  const workspacePath = optionalString(resolution.workspacePath);
  if (workspacePath) {
    target.workspace_path = workspacePath;
  }
}

function resourceRequired(resource: TurnInputResource): boolean {
  return resource.required === true;
}

export async function resolveTurnInputResources(input: {
  resources?: TurnInputResource[] | null;
  resolvers?: TurnResourceResolverRegistry | null;
  context: TurnResourceResolverContext;
}): Promise<TurnInputResourceResolutionResult> {
  const resources = Array.isArray(input.resources) ? input.resources : [];
  const resolvers = input.resolvers ?? {};
  const payload: JsonRecord = {};
  const metadata: JsonRecord = {};
  const displayAttachments: SdkDisplayAttachment[] = [];
  const failures: TurnInputResourceResolutionFailure[] = [];

  for (const resource of resources) {
    const resolver = resolvers[resource.kind];
    if (!resolver) {
      const message = `No resolver registered for ${resource.kind}`;
      failures.push({
        kind: resource.kind,
        message,
        fatal: resourceRequired(resource),
      });
      const failedAttachment = displayAttachmentFailure(resource, message);
      if (failedAttachment) {
        displayAttachments.push(failedAttachment);
      }
      continue;
    }

    let resolution: TurnResourceResolution | null | undefined;
    try {
      resolution = await resolver(resource, input.context);
    } catch (error) {
      const message = errorMessage(error);
      failures.push({
        kind: resource.kind,
        message,
        fatal: resourceRequired(resource),
      });
      const failedAttachment = displayAttachmentFailure(resource, message);
      if (failedAttachment) {
        displayAttachments.push(failedAttachment);
      }
      continue;
    }

    if (!resolution) {
      continue;
    }
    applyResolution(payload, resolution);
    if (isJsonRecord(resolution.metadata)) {
      Object.assign(metadata, resolution.metadata);
    }
    const displayAttachment = normalizeDisplayAttachment(resolution.displayAttachment);
    if (displayAttachment) {
      displayAttachments.push(displayAttachment);
    }
    const message = optionalString(resolution.error);
    if (message) {
      failures.push({
        kind: resource.kind,
        message,
        fatal: resolution.fatal === true || resourceRequired(resource),
      });
      if (!displayAttachment) {
        const failedAttachment = displayAttachmentFailure(resource, message);
        if (failedAttachment) {
          displayAttachments.push(failedAttachment);
        }
      }
    }
  }

  if (displayAttachments.length > 0) {
    metadata.attachments = displayAttachments;
  }

  if (failures.length > 0) {
    metadata.turn_resource_failures = failures.map(failure => ({
      kind: failure.kind,
      message: failure.message,
      fatal: failure.fatal,
    }));
  }

  const fatalFailure = failures.find(failure => failure.fatal);
  if (fatalFailure) {
    throw new Error(fatalFailure.message);
  }

  return {
    payload,
    metadata,
    failures,
  };
}
