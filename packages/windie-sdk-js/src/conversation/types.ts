/**
 * Defines types contracts for the TypeScript SDK runtime.
 */

export type JsonRecord = Record<string, unknown>;

export type ConversationEventSource = 'backend' | 'sdk' | 'ui';

export type ConversationEventType =
  | 'conversation_created'
  | 'conversation_loaded'
  | 'conversation_rewritten'
  | 'turn_superseded'
  | 'turn_started'
  | 'turn_completed'
  | 'turn_stopped'
  | 'turn_error'
  | 'user_message'
  | 'assistant_delta'
  | 'reasoning_delta'
  | 'assistant_message'
  | 'system_prompt'
  | 'user_message_metadata'
  | 'tool_schemas_metadata'
  | 'usage_updated'
  | 'tool_call'
  | 'tool_progress'
  | 'tool_output'
  | 'tool_bundle_call'
  | 'tool_bundle_output'
  | 'memory_retrieval_diagnostic'
  | 'memory_store_changed'
  | 'trace_event'
  | 'model_history_updated'
  | 'compaction_started'
  | 'compaction_skipped'
  | 'compaction_applied'
  | 'compaction_failed'
  | 'settings_updated'
  | 'runtime_error';

export type MemoryStoreChangedPayload = JsonRecord & {
  userId: string;
  conversationRef?: string | null;
  memoryTypes: Array<'episodic' | 'semantic'>;
  reason: 'completed_turn' | 'delete' | 'clear' | 'semanticization';
  memoryId?: string | null;
};

export type TraceRuntime =
  | 'sdk'
  | 'electron-main'
  | 'renderer'
  | 'local-runtime'
  | 'backend'
  | 'provider';

export type TraceStatus =
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'ignored_for_live_authority';

export type TraceError = JsonRecord & {
  code: string;
  message: string;
};

export type TraceEventPayload = JsonRecord & {
  schemaVersion: 1;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  path: string;
  stage: string;
  status: TraceStatus;
  runtime: TraceRuntime;
  conversationRef?: string | null;
  turnRef?: string | null;
  requestId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: JsonRecord;
  error?: TraceError | null;
};

export type TraceTimelineEntry = TraceEventPayload & {
  eventId: string;
  timestamp: string;
};

export type TraceContext = JsonRecord & {
  traceId: string;
  parentSpanId?: string | null;
  conversationRef?: string | null;
  turnRef?: string | null;
  userId?: string | null;
};

export type TraceEventDraft = JsonRecord & {
  path: string;
  stage: string;
  status: TraceStatus;
  runtime?: TraceRuntime;
  parentSpanId?: string | null;
  requestId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: JsonRecord | null;
  error?: unknown;
};

export type ConversationEvent<TPayload extends JsonRecord = JsonRecord> = {
  eventId: string;
  type: ConversationEventType;
  conversationRef: string;
  turnRef?: string | null;
  revisionId: string;
  timestamp: string;
  source: ConversationEventSource;
  payload: TPayload;
};

export type ToolEventPayload = JsonRecord & {
  requestId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  correlationId?: string | null;
  toolName?: string | null;
  args?: JsonRecord | null;
  result?: unknown;
  success?: boolean | null;
  error?: string | null;
  artifactRefs?: unknown[] | null;
  structuredPayload?: JsonRecord | null;
};

export type DisplayTimelineReplaceReason =
  | 'user_edit'
  | 'retry'
  | 'fork'
  | 'manual_rewrite';

export type SupersededTurnReason =
  | 'user_edit'
  | 'retry'
  | 'manual_rewrite';

export type SupersededTurnRecord = JsonRecord & {
  conversationRef: string;
  supersededTurnRef: string;
  replacementTurnRef: string;
  revisionId: string;
  reason: SupersededTurnReason;
  createdAt: string;
};

export type DisplayTimelineRow = SdkDisplayRow & {
  revisionId: string;
};

export type DisplayTimelineCheckpoint = {
  conversationRef: string;
  revisionId: string;
  rows: DisplayTimelineRow[];
  createdAt: string;
  reason?: DisplayTimelineReplaceReason | null;
  baseRevisionId?: string | null;
};

export type CompactedReplaySnapshot = {
  generationId: string;
  conversationRef: string;
  sourceRevisionId: string;
  sourceTurnRef?: string | null;
  createdAt: string;
  entries: JsonRecord[];
  entryCount: number;
  complete: boolean;
  active?: boolean;
};

export type ModelHistoryRole = 'system' | 'user' | 'assistant' | 'tool';

export type ModelHistoryMessageType =
  | 'user_query'
  | 'assistant_response'
  | 'tool_output'
  | 'context_compaction';

export type ModelHistoryRow = {
  id: string;
  conversationRef: string;
  revisionId: string;
  role: ModelHistoryRole;
  messageType: ModelHistoryMessageType;
  content: unknown;
  toolCallId?: string | null;
  toolCalls?: unknown[] | null;
  toolName?: string | null;
  imageRefs?: string[] | null;
  compactionFacts?: JsonRecord | null;
  sourceDisplayRowIds?: string[];
};

export type ModelHistoryCheckpoint = {
  checkpointId: string;
  conversationRef: string;
  revisionId: string;
  rows: ModelHistoryRow[];
  createdAt: string;
};

export type ConversationRevision = {
  conversationRef: string;
  revisionId: string;
  parentRevisionId?: string | null;
  operation?: 'send' | 'edit' | 'retry' | 'fork' | 'compact' | 'manual_rewrite' | null;
  displayTimelineId?: string | null;
  modelHistoryCheckpointId?: string | null;
  createdAt?: string | null;
  updatedAt: string;
  active?: boolean;
};

export type ListConversationRevisionsOptions = {
  conversationRef: string;
  limit?: number;
};

export type ConversationMetadata = {
  conversationRef: string;
  revisionId: string;
  title?: string | null;
  lastMessage?: string | null;
  updatedAt: string;
  eventCount: number;
  workspacePath?: string | null;
  workspaceName?: string | null;
  snippet?: string | null;
  matchedRole?: string | null;
};

export type AppDiagnosticEventDraft = JsonRecord & {
  stage: string;
  status: 'started' | 'succeeded' | 'failed' | 'skipped';
  runtime: 'renderer' | 'electron-main' | 'sdk' | 'local-runtime' | 'backend' | 'provider';
  durationMs?: number | null;
  data?: JsonRecord | null;
  error?: unknown;
};

export type AppDiagnosticContext = JsonRecord & {
  path?: string;
  traceId?: string;
  parentSpanId?: string | null;
  requestId?: string;
  sessionId?: string;
  conversationRef?: string;
  emit?: (event: AppDiagnosticEventDraft) => void | Promise<void>;
};

export type ListConversationOptions = {
  limit?: number;
  cursor?: string;
  diagnostics?: AppDiagnosticContext;
};

export type SearchConversationOptions = ListConversationOptions & {
  query: string;
};

export type DisplayMessage = {
  id: string;
  conversationRef: string;
  turnRef?: string | null;
  revisionId: string;
  timestamp: string;
  sender: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  messageType: ConversationEventType;
  toolName?: string | null;
  requestId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  correlationId?: string | null;
  metadata?: JsonRecord;
};

export type SdkDisplayAttachmentSource =
  | 'user_included'
  | 'camera_button'
  | 'tool_result'
  | 'replay';

export type SdkDisplayAttachmentStatus =
  | 'materializing'
  | 'pending_capture'
  | 'ready'
  | 'failed';

export type SdkDisplayAttachment = {
  id: string;
  kind: 'image' | 'screenshot_request';
  source: SdkDisplayAttachmentSource;
  status: SdkDisplayAttachmentStatus;
  filename?: string | null;
  contentType?: string | null;
  previewSrc?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  errorCode?: string | null;
};

export type DisplayConversation = {
  conversationRef: string;
  revisionId: string;
  messages: DisplayMessage[];
  compaction: CompactionState;
};

export type SdkDisplayRowMetadata = {
  eventId?: string | null;
  source?: ConversationEventSource | string | null;
  revisionId?: string | null;
  timestamp?: string | null;
  reasoningText?: string | null;
  toolName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  displayCorrelationId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  toolCallDetails?: JsonRecord | null;
  toolOutputDetails?: JsonRecord | null;
  modelFacingToolCall?: JsonRecord | null;
  structuredPayload?: JsonRecord | null;
  screenshotRef?: string | null;
  screenshot_ref?: string | null;
  screenshotUrl?: string | null;
  screenshot_url?: string | null;
  screenshotRefs?: string[] | null;
  screenshot_refs?: string[] | null;
  screenshot?: string | null;
  screenshotContentType?: string | null;
  attachments?: SdkDisplayAttachment[] | null;
  sourceEventType?: string | null;
  replacedDisplayRowId?: string | null;
  success?: boolean | null;
  modelId?: string | null;
  modelProvider?: string | null;
  raw?: JsonRecord | null;
};

export type SdkDisplayRowActions = {
  canEdit?: boolean;
  editTargetRowId?: string | null;
  canRetry?: boolean;
  retryTargetRowId?: string | null;
};

export type SdkDisplayRow = (
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'user';
      type: 'user_message';
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'assistant';
      type: 'assistant_message';
      content: string;
      isStreaming?: boolean;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'assistant';
      type: 'tool_progress';
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'assistant';
      type: 'tool_call';
      content: JsonRecord;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'assistant';
      type: 'tool_bundle_call';
      content: JsonRecord;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'tool';
      type: 'tool_output';
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'tool';
      type: 'tool_bundle_output';
      content: JsonRecord;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'assistant';
      type: 'reasoning';
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: 'system';
      type: 'error';
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
) & {
  actions?: SdkDisplayRowActions;
};

export type CurrentTurnProjectionPhase =
  | 'idle'
  | 'awaiting'
  | 'streaming'
  | 'tool_call'
  | 'tool_output'
  | 'complete'
  | 'error';

export type CurrentTurnToolEventKind = 'tool_call' | 'tool_output' | 'tool_progress';

export type CurrentTurnToolEvent = {
  id: string;
  kind: CurrentTurnToolEventKind;
  toolName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  bundleId?: string | null;
  modelFacingToolCall?: JsonRecord | null;
  toolCalls?: JsonRecord[] | null;
  toolArguments?: JsonRecord | null;
  toolCallDetails?: JsonRecord | null;
  toolOutputDetails?: JsonRecord | null;
  toolMetadata?: JsonRecord | null;
  toolDisplayMetadata?: JsonRecord | null;
  attachments?: SdkDisplayAttachment[] | null;
  toolCallValidationFailed?: boolean | null;
  rawToolCallPreview?: string | null;
  rawArgumentsPreview?: string | null;
  parseError?: string | null;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  executionTime?: number | null;
  text?: string;
  status?: string | null;
  success?: boolean | null;
  executionSkipped?: boolean | null;
  payload: JsonRecord;
};

export type LiveTurnPresentationEntryType =
  | 'thinking'
  | 'llm-text'
  | 'tool-call'
  | 'tool-progress'
  | 'tool-output'
  | 'error';

export type LiveTurnPresentationEntry = {
  id: string;
  type: LiveTurnPresentationEntryType;
  text: string;
  sourceEventType?: string | null;
  sourceChannel?: string | null;
  turnRef?: string | null;
  toolName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  bundleId?: string | null;
  modelFacingToolCall?: JsonRecord | null;
  toolCalls?: JsonRecord[] | null;
  toolArguments?: JsonRecord | null;
  toolCallDetails?: JsonRecord | null;
  toolOutputDetails?: JsonRecord | null;
  toolMetadata?: JsonRecord | null;
  toolDisplayMetadata?: JsonRecord | null;
  attachments?: SdkDisplayAttachment[] | null;
  toolCallValidationFailed?: boolean | null;
  rawToolCallPreview?: string | null;
  rawArgumentsPreview?: string | null;
  parseError?: string | null;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  executionTime?: number | null;
  success?: boolean | null;
  executionSkipped?: boolean | null;
  modelId?: string | null;
  modelProvider?: string | null;
  isComplete?: boolean;
  payload?: JsonRecord | null;
};

export type LiveTurnAwaitingAnchor = {
  kind: 'user-message';
  rowId: string;
  turnRef: string | null;
  conversationRef: string;
};

export type LiveTurnOverlayIntentMode = 'hidden' | 'awaiting' | 'response';

export type LiveTurnOverlayIntent = {
  visible: boolean;
  mode: LiveTurnOverlayIntentMode;
  turnRef: string | null;
  conversationRef: string;
  staleGuardRef: string | null;
};

export type LiveTurnPresentation = {
  conversationRef: string;
  turnRef: string | null;
  phase: CurrentTurnProjectionPhase;
  entries: LiveTurnPresentationEntry[];
  hasVisibleContent: boolean;
  typingVisible: boolean;
  overlayVisible: boolean;
  isBusy: boolean;
  isTerminal: boolean;
  lastError: string | null;
  awaitingAnchor: LiveTurnAwaitingAnchor | null;
  overlayIntent: LiveTurnOverlayIntent;
};

export type CurrentTurnProjection = {
  conversationRef: string;
  turnRef: string | null;
  phase: CurrentTurnProjectionPhase;
  userMessageRowId: string | null;
  assistantText: string;
  reasoningText: string | null;
  toolEvents: CurrentTurnToolEvent[];
  lastError: string | null;
  presentation: LiveTurnPresentation;
};

export type ConversationViewLiveTurnPhase =
  | 'idle'
  | 'awaiting'
  | 'streaming'
  | 'tool'
  | 'complete'
  | 'error';

export type ConversationView = {
  conversationRef: string;
  revisionId: string | null;
  displayRows: SdkDisplayRow[];
  liveTurn: {
    turnRef: string | null;
    phase: ConversationViewLiveTurnPhase;
    entries: LiveTurnPresentationEntry[];
    isBusy: boolean;
    isTerminal: boolean;
    canStop: boolean;
    lastError?: string | null;
  };
  surfaces: {
    pill: {
      mode: 'idle' | 'busy';
    };
    dashboard: {
      mode: 'idle' | 'busy';
    };
    responseOverlay: {
      mode: 'hidden' | 'typing' | 'response';
      visible: boolean;
      guardRef: string | null;
      ownerConversationRef: string;
      turnRef: string | null;
    };
  };
  actions: {
    canEdit: boolean;
    canRetry: boolean;
    canFork: boolean;
  };
};

export type ConversationViewBuildDiagnostics = {
  activeRevisionId: string | null;
  displayRowCount: number;
  liveTurnRef: string | null;
  liveTurnPhase: ConversationViewLiveTurnPhase;
  responseOverlayMode: ConversationView['surfaces']['responseOverlay']['mode'];
  responseOverlayGuardRef: string | null;
  pendingTurnRef: string | null;
  supersededTurnCount: number;
  filteredInternalLaneCount: number;
  modelHistoryCheckpointId: string | null;
  lastEventRef: string | null;
  lastSdkEventRef: string | null;
  lastBackendEventRef: string | null;
};

export type ConversationViewBuildInput = {
  conversationRef?: string | null;
  revisionId?: string | null;
  state?: ConversationRuntimeState | null;
  displayRows?: SdkDisplayRow[] | null;
  currentTurn?: CurrentTurnProjection | null;
  events?: ConversationEvent[] | null;
  pendingTurnRef?: string | null;
  modelHistoryCheckpoint?: Pick<ModelHistoryCheckpoint, 'checkpointId'> | null;
};

export type RehydrateSnapshot = {
  conversationRef: string;
  revisionId: string;
  messages: JsonRecord[];
  replayGenerationId?: string | null;
};

export type AgentDefinition = JsonRecord;

export type QueryPayload = JsonRecord & {
  text: string;
  conversation_ref: string;
};

export type TurnInputResource =
  | {
      kind: 'readable_file';
      filePath: string;
      filename: string;
      required?: boolean;
    }
  | {
      kind: 'clipboard_image';
      displayAttachmentId?: string | null;
      base64: string;
      contentType?: string | null;
      filename?: string | null;
      required?: boolean;
    }
  | {
      kind: 'query_screenshot_request';
      displayAttachmentId?: string | null;
      isFirstUserMessage?: boolean;
      reason?: string | null;
      required?: boolean;
    }
  | {
      kind: 'workspace';
      workspacePath: string;
      required?: boolean;
    };

export type TurnInputResourceKind = TurnInputResource['kind'];

export type TurnResourceResolution = {
  kind: TurnInputResourceKind;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotRefs?: string[] | null;
  captureMeta?: JsonRecord | null;
  workspacePath?: string | null;
  metadata?: JsonRecord | null;
  displayAttachment?: SdkDisplayAttachment | null;
  error?: string | null;
  fatal?: boolean;
};

export type TurnResourceResolverContext = {
  text: string;
  conversationRef: string;
  turnRef: string;
  payload: JsonRecord;
  traceContext?: TraceContext | null;
  emitTrace?: (event: TraceEventDraft) => void | Promise<void>;
};

export type TurnResourceResolver = (
  resource: TurnInputResource,
  context: TurnResourceResolverContext,
) => Promise<TurnResourceResolution | null | undefined>;

export type TurnResourceResolverRegistry = Partial<Record<TurnInputResourceKind, TurnResourceResolver>>;

export type SendQueryOptions = {
  messageId?: string | null;
};

export type ToolResultPayload = {
  request_id: string;
  success: boolean;
  data?: JsonRecord | null;
  error?: string | null;
};

export type ToolBundleStepResult = JsonRecord & {
  tool: string;
  status: 'ok' | 'error' | string;
  output?: unknown;
};

export type ToolBundleResultPayload = {
  bundle_id: string;
  status: 'success' | 'partial_failure' | 'failure';
  step_results: ToolBundleStepResult[];
  screenshot?: string | null;
  screenshot_ref?: string | null;
  screenshot_url?: string | null;
  screenshot_content_type?: string | null;
  capture_meta?: JsonRecord | null;
  system_state?: JsonRecord | null;
  error?: string | null;
};

export type RehydratePayload = {
  conversation_ref: string;
  messages?: JsonRecord[];
  model_history?: JsonRecord | null;
  rehydrate_mode: 'replace';
  workspace_path?: string | null;
  repo_instruction_messages?: JsonRecord[] | null;
};

export type StopPayload = {
  conversation_ref?: string | null;
  turn_ref?: string | null;
};

export type SettingsPayload = JsonRecord;

export type CompactHistoryPayload = JsonRecord & {
  force?: boolean;
  conversation_ref?: string | null;
};

export type WakewordPayload = JsonRecord;

export type LocalRuntimeStatus = JsonRecord;

export type ToolRegistration = JsonRecord & {
  name: string;
};

export type LocalToolMetadata = JsonRecord & {
  name: string;
  description?: string | null;
  execution_target?: string | null;
  schema?: JsonRecord;
};

export type LocalToolManifest = JsonRecord & {
  version?: number;
  tools: LocalToolMetadata[];
};

export type ToolTrace = {
  conversationRef: string;
  revisionId: string;
  calls: DisplayMessage[];
  outputs: DisplayMessage[];
};

export type CompactionState = {
  status: 'idle' | 'started' | 'skipped' | 'applied' | 'failed';
  skippedReason?: string | null;
  generationId?: string | null;
  summaryPreview?: string | null;
  debug?: JsonRecord | null;
};

export type ConversationRuntimePhase =
  | 'idle'
  | 'sending'
  | 'awaiting_first_chunk'
  | 'streaming'
  | 'tool_call_pending'
  | 'tool_executing'
  | 'tool_result_sent'
  | 'compacting'
  | 'completed'
  | 'stopped'
  | 'error';

export type ConversationRuntimeState = {
  conversationRef: string;
  revisionId: string;
  activeTurnRef?: string | null;
  phase: ConversationRuntimePhase;
  settings: JsonRecord;
  pendingTools: Record<string, ToolEventPayload>;
  activeBundle?: ToolEventPayload | null;
  compaction: CompactionState;
  stream: {
    text: string;
    lastEventId?: string | null;
  };
  stopState: {
    requested: boolean;
    turnRef?: string | null;
  };
  supersededTurns: Record<string, SupersededTurnRecord>;
  lastError?: string | null;
};

export interface ConversationStore {
  appendEvent(event: ConversationEvent): Promise<void>;
  appendEvents(events: ConversationEvent[]): Promise<void>;
  replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void>;
  loadEvents(conversationRef: string): Promise<ConversationEvent[]>;
  loadForDisplay(conversationRef: string): Promise<DisplayConversation>;
  loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]>;
  loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot>;
  replaceDisplayTimeline?(checkpoint: DisplayTimelineCheckpoint): Promise<void>;
  loadDisplayTimeline?(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<DisplayTimelineCheckpoint | null>;
  replaceModelHistory?(checkpoint: ModelHistoryCheckpoint): Promise<void>;
  loadModelHistory?(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<ModelHistoryCheckpoint | null>;
  listMetadata(options?: ListConversationOptions): Promise<ConversationMetadata[]>;
  searchMetadata?(options: SearchConversationOptions): Promise<ConversationMetadata[]>;
  deleteConversation?(conversationRef: string): Promise<void>;
  clearConversations?(): Promise<void>;
  getRevision(conversationRef: string): Promise<ConversationRevision>;
  listRevisions?(options: ListConversationRevisionsOptions): Promise<ConversationRevision[]>;
  loadCompactedReplay?(conversationRef: string): Promise<CompactedReplaySnapshot | null>;
}

export type AgentRuntimeTransport = {
  connect(): Promise<void>;
  handshake(agentDefinition: AgentDefinition): Promise<void>;
  sendQuery(payload: QueryPayload, options?: SendQueryOptions): Promise<string>;
  sendToolResult(payload: ToolResultPayload): Promise<void>;
  sendToolBundleResult(payload: ToolBundleResultPayload): Promise<void>;
  rehydrateConversation(payload: RehydratePayload): Promise<void>;
  compactHistory(payload: CompactHistoryPayload): Promise<string | void>;
  wakewordDetected(payload: WakewordPayload): Promise<string | void>;
  updateSettings(payload: SettingsPayload): Promise<string | void>;
  listModels(): Promise<string | void>;
  stop(payload: StopPayload): Promise<void>;
  subscribe(listener: (event: unknown) => void): () => void;
  close(): Promise<void>;
};

export type LocalToolCall = {
  toolName: string;
  args: JsonRecord;
  requestId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  correlationId?: string | null;
  turnRef?: string | null;
  conversationRef?: string | null;
};

export type LocalToolResult = {
  success?: boolean;
  data?: JsonRecord;
  error?: string;
};

export type LocalToolExecutionReleaseFunction = (() => void | Promise<void>) & {
  trace?: JsonRecord | null;
};

export type LocalToolExecutionLease = {
  release?: () => void | Promise<void>;
  trace?: JsonRecord | null;
};

export type LocalToolExecutionRelease =
  | void
  | LocalToolExecutionReleaseFunction
  | LocalToolExecutionLease;

export type LocalToolExecutionLifecycle = {
  beforeExecute?: (call: LocalToolCall) => LocalToolExecutionRelease | Promise<LocalToolExecutionRelease>;
};

export type LocalRuntime = {
  status(): Promise<LocalRuntimeStatus>;
  listTools(): Promise<LocalToolManifest>;
  executeTool(call: LocalToolCall): Promise<LocalToolResult>;
  rpc?(payload: { method: string; params?: JsonRecord; id?: string | number }): Promise<JsonRecord>;
  registerTools?(tools: ToolRegistration[]): Promise<void>;
  shutdown?(): Promise<void>;
};
