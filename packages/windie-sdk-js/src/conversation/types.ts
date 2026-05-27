export type JsonRecord = Record<string, unknown>;

export type ConversationEventSource = 'backend' | 'sdk' | 'sidecar' | 'ui';

export type ConversationEventType =
  | 'conversation_created'
  | 'conversation_loaded'
  | 'conversation_rewritten'
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
  | 'memory_stored'
  | 'tool_call'
  | 'tool_progress'
  | 'tool_output'
  | 'tool_bundle_call'
  | 'tool_bundle_output'
  | 'compaction_started'
  | 'compaction_skipped'
  | 'compaction_applied'
  | 'compaction_failed'
  | 'settings_updated'
  | 'runtime_error';

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

export type ConversationRewritePlan = {
  conversationRef: string;
  baseRevisionId: string;
  newRevisionId: string;
  cutAfterEventId?: string | null;
  replacementUserMessage?: JsonRecord | null;
  preservedEvents: ConversationEvent[];
  removedEventIds: string[];
  reason: 'edit_resend' | 'retry' | 'transcript_projection_rewrite';
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

export type ConversationRevision = {
  conversationRef: string;
  revisionId: string;
  updatedAt: string;
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

export type ListConversationOptions = {
  limit?: number;
  cursor?: string;
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
  toolName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  modelId?: string | null;
  modelProvider?: string | null;
  raw?: JsonRecord | null;
};

export type SdkDisplayRow =
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
      type: 'tool_call';
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
  text?: string;
  status?: string | null;
  payload: JsonRecord;
};

export type CurrentTurnProjection = {
  conversationRef: string;
  turnRef: string | null;
  phase: CurrentTurnProjectionPhase;
  assistantText: string;
  reasoningText: string | null;
  toolEvents: CurrentTurnToolEvent[];
  lastError: string | null;
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
  capture_meta?: JsonRecord | null;
  system_state?: JsonRecord | null;
  error?: string | null;
};

export type RehydratePayload = {
  conversation_ref: string;
  messages: JsonRecord[];
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
  lastError?: string | null;
};

export interface ConversationStore {
  appendEvent(event: ConversationEvent): Promise<void>;
  appendEvents(events: ConversationEvent[]): Promise<void>;
  rewriteConversation(plan: ConversationRewritePlan): Promise<void>;
  replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void>;
  loadEvents(conversationRef: string): Promise<ConversationEvent[]>;
  loadForDisplay(conversationRef: string): Promise<DisplayConversation>;
  loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot>;
  listMetadata(options?: ListConversationOptions): Promise<ConversationMetadata[]>;
  searchMetadata?(options: SearchConversationOptions): Promise<ConversationMetadata[]>;
  deleteConversation?(conversationRef: string): Promise<void>;
  getRevision(conversationRef: string): Promise<ConversationRevision>;
  loadCompactedReplay?(conversationRef: string): Promise<CompactedReplaySnapshot | null>;
}

export type BackendTransport = {
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

export type LocalRuntime = {
  status(): Promise<LocalRuntimeStatus>;
  listTools(): Promise<LocalToolManifest>;
  executeTool(call: LocalToolCall): Promise<LocalToolResult>;
  registerTools?(tools: ToolRegistration[]): Promise<void>;
  shutdown?(): Promise<void>;
};
