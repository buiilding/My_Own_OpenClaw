import type { WindieModelSelection } from '../../infrastructure/api/windieSdkClient';
import {
  type JsonRecord,
  InMemoryConversationStore,
  type RehydrateSnapshot,
  createConversationRuntime,
} from '../../infrastructure/api/windieSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import {
  type LocalConversationSnapshot,
} from '../../infrastructure/transcript/conversationLocalSnapshotLoader';
import {
  DesktopTranscriptProjectionRuntimeClient,
  type LoadRehydrateSnapshotInput,
  type TranscriptProjectionRewriteEntry,
} from './desktopTranscriptProjectionRuntimeClient';
import type { CompactedReplaySnapshot } from '../../infrastructure/api/windieSdkClient';
import { createDesktopBackendTransport } from './desktopBackendTransport';
import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import type { CaptureMeta } from '../../infrastructure/services/ScreenshotAttachmentPipeline';

export type { RehydrateConversationEntry };

type RehydrateConversationEntry = JsonRecord & {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  message_type?: string;
  tool_name?: string | null;
  correlation_id?: string | null;
  tool_call_id?: string | null;
  tool_calls?: Array<Record<string, unknown>> | null;
  timestamp?: string | null;
  screenshot_ref?: string | null;
  screenshot?: string | null;
  image_data?: string | string[] | null;
  transparency?: Record<string, unknown> | null;
  structured_content?: Array<Record<string, unknown>> | null;
  compaction_facts?: Record<string, unknown> | null;
  structured_payload?: Record<string, unknown> | null;
};

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

type SendConversationRehydrateInput = {
  conversationRef: string;
  messages: RehydrateConversationEntry[];
  workspacePath?: string | null;
};

type RewriteAndResendInput = {
  conversationRef: string;
  userId: string;
  messageId: string;
  text?: string;
  projectionEntries: TranscriptProjectionRewriteEntry[];
  payload?: JsonRecord;
  model?: WindieModelSelection | null;
  workspacePath?: string | null;
};

type RehydrateFromStoreInput = LoadRehydrateSnapshotInput & {
  workspacePath?: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function createSeededConversationRuntime({
  conversationRef,
  userId,
  projectionEntries,
  workspacePath,
}: Pick<RewriteAndResendInput, 'conversationRef' | 'userId' | 'projectionEntries' | 'workspacePath'>) {
  const store = await DesktopTranscriptProjectionRuntimeClient.createSeededConversationStore({
    conversationRef,
    userId,
    projectionEntries,
  });
  const runtime = createConversationRuntime({
    conversationRef,
    store,
    transport: createDesktopBackendTransport(workspacePath ?? null),
  });
  await runtime.load();
  return runtime;
}

class StaticRehydrateConversationStore extends InMemoryConversationStore {
  constructor(
    private readonly conversationRef: string,
    private readonly messages: RehydrateConversationEntry[],
  ) {
    super();
  }

  async loadForRehydrate(): Promise<RehydrateSnapshot> {
    return {
      conversationRef: this.conversationRef,
      revisionId: `rev-rehydrate-${this.conversationRef}`,
      messages: this.messages,
    };
  }
}

/**
 * Renderer command facade for the SDK runtime hosted by Electron main.
 *
 * Feature code should use this app runtime module instead of importing
 * low-level backend IPC or transcript storage adapters directly.
 */
export const DesktopConversationRuntimeClient = {
  getActiveConversationRef(): string | null {
    return DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
  },

  getTranscriptSessionInfo(): ReturnType<typeof DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo> {
    return DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  },

  setActiveConversationRef(conversationRef: string | null): void {
    DesktopTranscriptSessionRuntimeClient.setActiveConversationRef(conversationRef);
  },

  updateTranscriptSession(
    conversationRef?: string | null,
    userId?: string | null,
  ): void {
    DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(conversationRef, userId);
  },

  setModel(selection: WindieModelSelection): void {
    DesktopSettingsRuntimeClient.setModel(selection);
  },

  async replaceCompactedReplay(
    snapshot: CompactedReplaySnapshot,
    userId: string,
  ): Promise<void> {
    await DesktopConversationContinuityService.replaceCompactedReplay(snapshot, userId);
  },

  async loadRehydrateSnapshot(input: LoadRehydrateSnapshotInput) {
    return DesktopConversationContinuityService.loadRehydrateSnapshot(input);
  },

  async rehydrateFromStore(input: RehydrateFromStoreInput): Promise<void> {
    await DesktopConversationContinuityService.rehydrateFromStore(input);
  },

  async loadLocalConversationSnapshot(
    input: Parameters<typeof DesktopConversationContinuityService.loadLocalConversationSnapshot>[0],
  ): Promise<LocalConversationSnapshot> {
    return DesktopConversationContinuityService.loadLocalConversationSnapshot(input);
  },

  async editAndResend(input: RewriteAndResendInput): Promise<void> {
    const runtime = await createSeededConversationRuntime(input);
    await runtime.editAndResend({
      messageId: input.messageId,
      text: input.text ?? '',
      payload: input.payload,
      model: input.model ?? undefined,
    });
  },

  async retryTurn(input: RewriteAndResendInput): Promise<void> {
    const runtime = await createSeededConversationRuntime(input);
    await runtime.retryTurn({
      messageId: input.messageId,
      payload: input.payload,
      model: input.model ?? undefined,
    });
  },

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

  async rehydrate(input: SendConversationRehydrateInput): Promise<void> {
    const runtime = createConversationRuntime({
      conversationRef: input.conversationRef,
      store: new StaticRehydrateConversationStore(input.conversationRef, input.messages),
      transport: createDesktopBackendTransport(input.workspacePath ?? null),
    });
    await runtime.rehydrate();
  },

  async stop(conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? this.getActiveConversationRef();
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
      ?? this.getActiveConversationRef();
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
