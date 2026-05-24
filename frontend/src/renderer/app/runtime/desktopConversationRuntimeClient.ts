import {
  InMemoryConversationStore,
  createConversationRuntime,
} from '../../infrastructure/api/windieSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { createDesktopBackendTransport } from './desktopBackendTransport';
import type { CaptureMeta } from '../../infrastructure/services/ScreenshotAttachmentPipeline';

type SendConversationQueryInput = {
  text: string;
  conversationRef: string;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotRefs?: string[] | null;
  captureMeta?: CaptureMeta | null;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  screenshot?: string | null;
  workspacePath?: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Feature code should use this app runtime module instead of importing
 * low-level backend IPC or transcript storage adapters directly.
 */
export const DesktopConversationRuntimeClient = {
  async sendQuery(input: SendConversationQueryInput): Promise<void> {
    const runtime = createConversationRuntime({
      conversationRef: input.conversationRef,
      store: new InMemoryConversationStore(),
      transport: createDesktopBackendTransport(input.workspacePath ?? null),
    });
    await runtime.send({
      text: input.text,
      payload: {
        screenshot_ref: input.screenshotRef ?? null,
        screenshot_url: input.screenshotUrl ?? null,
        screenshot_refs: input.screenshotRefs ?? null,
        capture_meta: input.captureMeta ?? null,
        attachment_context: input.attachmentContext ?? null,
        attachment_filenames: input.attachmentFilenames ?? null,
        screenshot: input.screenshot ?? null,
        workspace_path: input.workspacePath ?? null,
      },
    });
  },

  async stop(conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    const runtime = createConversationRuntime({
      conversationRef: resolvedConversationRef,
      store: new InMemoryConversationStore(),
      transport: createDesktopBackendTransport(null),
    });
    await runtime.stop(null);
  },

  async compactHistory(force: boolean = true, conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    const runtime = createConversationRuntime({
      conversationRef: resolvedConversationRef,
      store: new InMemoryConversationStore(),
      transport: createDesktopBackendTransport(null),
    });
    await runtime.compactHistory({ force });
  },
};
