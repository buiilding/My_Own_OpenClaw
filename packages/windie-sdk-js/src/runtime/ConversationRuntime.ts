/**
 * Coordinates the conversation runtime for the TypeScript SDK runtime.
 */

import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import { isBackendEvent } from '../events/backendEvents.js';
import type {
  BackendTransport,
  CompactHistoryPayload,
  ConversationEvent,
  ConversationRuntimeState,
  ConversationStore,
  CurrentTurnProjection,
  DisplayConversation,
  JsonRecord,
  LocalToolExecutionLifecycle,
  LocalRuntime,
  MemoryStoreChangedPayload,
  RehydratePayload,
  RehydrateSnapshot,
  SdkDisplayRow,
  SettingsPayload,
  TraceEventPayload,
  TurnInputResource,
  TurnResourceResolverRegistry,
  WakewordPayload,
} from '../conversation/types.js';
import {
  buildCurrentTurnProjection,
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import { normalizeBackendEventToConversationEvent } from '../transport/backendEventNormalizer.js';
import { mergeQueryAgentDefinition } from '../transport/AgentSession.js';
import type { AgentHostedBackendClient } from '../transport/HostedBackendHttpClient.js';
import { ToolExecutionCoordinator } from '../tools/ToolExecutionCoordinator.js';
import {
  buildModelSettingsPatch,
  type AgentModelSelection,
} from '../settings/modelSelection.js';
import {
  storeCompletedTurnMemory,
  type MemoryRetrievalDiagnostic,
} from './ContextEnrichmentPipeline.js';
import { TraceRecorder, type TraceEventInput } from './TraceRecorder.js';
import { reduceConversationRuntimeState, createInitialConversationRuntimeState } from './conversationReducer.js';
import { getConversationEventScope, isConversationControlEvent } from './conversationEventScope.js';
import { isCompactionStdoutEnabled } from './debugEnv.js';
import {
  resolveTurnInputResources,
  type TurnInputResourceResolutionResult,
} from './TurnInputPipeline.js';

function nowMs(): number {
  return Date.now();
}

function durationSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

const LOCAL_RUNTIME_RPC_TRACE_PATH = 'local_runtime.rpc';

function optionalRequestId(value: string | void | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type ConversationListener = (snapshot: ConversationSnapshot) => void;
export type ConversationEventListener = (event: ConversationEvent, snapshot: ConversationSnapshot) => void;

export type ConversationSnapshot = {
  state: ConversationRuntimeState;
  display: DisplayConversation;
  displayRows: SdkDisplayRow[];
  rehydrate: RehydrateSnapshot;
  currentTurn: CurrentTurnProjection;
};

export type SendInput = {
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
  resources?: TurnInputResource[] | null;
  metadata?: JsonRecord | null;
  model?: AgentModelSelection;
};

export type TurnResult = {
  turnRef: string;
  queryMessageId: string;
};

export type EditAndResendInput = {
  messageId: string;
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
  model?: AgentModelSelection;
};

export type RetryTurnInput = {
  messageId?: string;
  turnRef?: string;
  payload?: JsonRecord;
  model?: AgentModelSelection;
};

export type PreparedReplayTurn = {
  text: string;
  turnRef?: string;
  payload: JsonRecord;
  model?: AgentModelSelection;
};

export type CompactHistoryInput = {
  force?: boolean;
  payload?: JsonRecord;
};

export type AgentRuntimeEvent =
  | {
      type: 'turn_started';
      result: TurnResult;
      snapshot: ConversationSnapshot;
    }
  | {
      type: 'conversation_event';
      event: ConversationEvent;
      snapshot: ConversationSnapshot;
    }
  | {
      type: 'error';
      error: unknown;
      snapshot?: ConversationSnapshot;
    };

export type ConversationRuntimeOptions = {
  conversationRef: string;
  revisionId?: string;
  store: ConversationStore;
  transport?: BackendTransport;
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool' | 'rpc'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  sdkClient?: AgentHostedBackendClient;
  userId?: string;
  memoryEnabled?: boolean;
  agentDefinition?: JsonRecord | null;
  resourceResolvers?: TurnResourceResolverRegistry | null;
  enrichQuery?: (input: {
    text: string;
    conversationRef: string;
    payload?: JsonRecord | null;
    emitDiagnostic?: (diagnostic: MemoryRetrievalDiagnostic) => void | Promise<void>;
    traceContext?: ReturnType<TraceRecorder['context']>;
    emitTrace?: (event: TraceEventInput) => void | Promise<void>;
  }) => Promise<JsonRecord>;
};

type PendingTurn = {
  turnRef: string;
  conversationRef: string;
  revisionId: string;
  userText: string;
};

type CompletedTurnTitleInput = {
  userId: string;
  conversationRef: string;
  turnRef?: string | null;
  revisionId?: string | null;
  userMessage: string;
  assistantMessage: string;
  modelId?: string;
  modelProvider?: string;
};

const completedTurnTitleGenerationInFlight = new Set<string>();

function eventText(event: ConversationEvent): string {
  if (typeof event.payload.text === 'string') {
    return event.payload.text;
  }
  if (typeof event.payload.content === 'string') {
    return event.payload.content;
  }
  return '';
}

function eventMatchesId(event: ConversationEvent, messageId: string): boolean {
  return event.eventId === messageId
    || event.payload.id === messageId
    || event.payload.messageId === messageId
    || event.payload.message_id === messageId;
}

function resolvedUserTurnPayload(events: ConversationEvent[], userIndex: number): JsonRecord {
  const userEvent = events[userIndex];
  if (!userEvent || userEvent.type !== 'user_message') {
    return {};
  }
  const payload: JsonRecord = { ...userEvent.payload };
  const turnRef = userEvent.turnRef;
  for (let index = userIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.type === 'user_message') {
      break;
    }
    if (event.type !== 'user_message_metadata') {
      continue;
    }
    if (turnRef) {
      if (event.turnRef !== turnRef) {
        continue;
      }
    } else if (event.turnRef) {
      continue;
    }
    Object.assign(payload, event.payload);
  }
  return payload;
}

function mergeReplayPayload(
  resolvedPayload: JsonRecord,
  overridePayload?: JsonRecord | null,
): JsonRecord {
  const payload: JsonRecord = { ...resolvedPayload };
  if (!overridePayload) {
    return payload;
  }
  for (const [key, value] of Object.entries(overridePayload)) {
    if (value === null || value === undefined) {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function isTerminalConversationEvent(event: ConversationEvent): boolean {
  return event.type === 'turn_completed'
    || event.type === 'turn_stopped'
    || event.type === 'turn_error'
    || event.type === 'runtime_error'
    || event.type === 'compaction_failed';
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function arrayRecordCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function getAgentDefinitionClientManifestTools(agentDefinition: unknown): JsonRecord[] {
  if (!isJsonRecord(agentDefinition)) {
    return [];
  }
  const tools = isJsonRecord(agentDefinition.tools) ? agentDefinition.tools : null;
  const clientManifest = isJsonRecord(tools?.client_manifest) ? tools.client_manifest : null;
  const manifestTools = Array.isArray(clientManifest?.tools) ? clientManifest.tools : [];
  return manifestTools.filter(isJsonRecord);
}

function getMcpManifestToolStats(agentDefinition: unknown): { toolCount: number; serverCount: number } {
  const mcpTools = getAgentDefinitionClientManifestTools(agentDefinition).filter((tool) => (
    typeof tool.mcp_server_id === 'string' && tool.mcp_server_id.trim().length > 0
  ));
  const serverIds = new Set(
    mcpTools
      .map((tool) => (typeof tool.mcp_server_id === 'string' ? tool.mcp_server_id.trim() : ''))
      .filter(Boolean),
  );
  return {
    toolCount: mcpTools.length,
    serverCount: serverIds.size,
  };
}

function getAgentDefinitionToolCount(agentDefinition: unknown): number {
  if (!isJsonRecord(agentDefinition)) {
    return 0;
  }
  if (Array.isArray(agentDefinition.tools)) {
    return agentDefinition.tools.length;
  }
  return getAgentDefinitionClientManifestTools(agentDefinition).length;
}

function getAgentDefinitionCapabilityRevision(agentDefinition: unknown): string | null {
  if (!isJsonRecord(agentDefinition) || !isJsonRecord(agentDefinition.metadata)) {
    return null;
  }
  const revision = agentDefinition.metadata.client_capability_revision;
  if (typeof revision === 'string' && revision.trim()) {
    return revision.trim();
  }
  const capability = agentDefinition.metadata.client_capability;
  if (isJsonRecord(capability) && typeof capability.revision === 'string' && capability.revision.trim()) {
    return capability.revision.trim();
  }
  return null;
}

function recordKeyCount(value: unknown): number {
  return isJsonRecord(value) ? Object.keys(value).length : 0;
}

function hasOwnEnumerableKeys(value: JsonRecord): boolean {
  return Object.keys(value).length > 0;
}

function stringPayloadField(payload: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function completedAssistantResponse(event: ConversationEvent): string {
  return stringPayloadField(event.payload, 'finalResponse', 'final_response', 'text', 'content') ?? '';
}

function rpcResponseData(response: unknown, fallbackError: string): JsonRecord {
  const record = isJsonRecord(response) ? response : {};
  if (record.success === false) {
    const error = typeof record.error === 'string' && record.error.trim()
      ? record.error
      : fallbackError;
    throw new Error(error);
  }
  return isJsonRecord(record.data) ? record.data : record;
}

function titleStateAllowsGeneratedTitle(response: unknown): boolean {
  const state = rpcResponseData(response, 'Conversation title state RPC failed');
  if (state.is_locked === true || state.isLocked === true) {
    return false;
  }
  const title = typeof state.title === 'string' ? state.title.trim() : '';
  if (!title) {
    return true;
  }
  const source = typeof state.source === 'string' ? state.source.trim().toLowerCase() : '';
  return source === 'heuristic';
}

function titleGenerationKey(input: CompletedTurnTitleInput): string {
  return `${input.userId}:${input.conversationRef}`;
}

export class SdkConversationRuntime {
  private state: ConversationRuntimeState;
  private events: ConversationEvent[] = [];
  private readonly listeners = new Set<ConversationListener>();
  private readonly eventListeners = new Set<ConversationEventListener>();
  private readonly localEventCounters = new Map<string, number>();
  private readonly backendTurnSequences = new Map<string, { lastSequence: number; eventIds: Set<string> }>();
  private readonly pendingTurns = new Map<string, PendingTurn>();
  private backendEventQueue: Promise<void> = Promise.resolve();
  private detachTransport?: () => void;

  constructor(
    private readonly options: ConversationRuntimeOptions,
  ) {
    this.state = createInitialConversationRuntimeState(
      options.conversationRef,
      options.revisionId,
    );
  }

  async load(): Promise<ConversationSnapshot> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    this.events = events;
    this.state = events.reduce(
      (state, event) => reduceConversationRuntimeState(state, event),
      createInitialConversationRuntimeState(
        this.options.conversationRef,
        events[events.length - 1]?.revisionId ?? this.state.revisionId,
      ),
    );
    return this.snapshot(this.events);
  }

  subscribe(listener: ConversationListener): () => void {
    this.listeners.add(listener);
    void this.load().then(snapshot => listener(snapshot));
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeEvents(listener: ConversationEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  attachTransport(): void {
    if (!this.options.transport || this.detachTransport) {
      return;
    }
    this.detachTransport = this.options.transport.subscribe(sourceEvent => {
      if (!isBackendEvent(sourceEvent)) {
        return;
      }
      const event = normalizeBackendEventToConversationEvent(sourceEvent, {
        fallbackRevisionId: this.state.revisionId,
        fallbackConversationRef: this.options.conversationRef,
        fallbackTurnRef: this.state.activeTurnRef ?? undefined,
      });
      if (event) {
        this.enqueueBackendEvent(event);
      }
    });
  }

  async send(input: SendInput): Promise<TurnResult> {
    if (input.model) {
      await this.setModel(input.model);
    }
    const turnRef = input.turnRef ?? createRuntimeId('turn');
    const revisionId = this.state.revisionId === 'rev-empty'
      ? createRuntimeId('rev')
      : this.state.revisionId;
    const memoryDiagnostics: MemoryRetrievalDiagnostic[] = [];
    const emitMemoryDiagnostic = (diagnostic: MemoryRetrievalDiagnostic): void => {
      memoryDiagnostics.push(diagnostic);
    };
    const traceRecorder = new TraceRecorder({
      conversationRef: this.options.conversationRef,
      turnRef,
      userId: this.options.userId ?? null,
      emit: async payload => {
        await this.applyEvent(createConversationEvent<TraceEventPayload>({
          eventId: this.nextLocalEventId(turnRef, 'trace_event'),
          type: 'trace_event',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload,
        }));
      },
    });
    const pendingTurn: PendingTurn = {
      turnRef,
      conversationRef: this.options.conversationRef,
      revisionId,
      userText: input.text,
    };
    this.pendingTurns.set(turnRef, pendingTurn);
    let queryMessageId: string;
    try {
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'turn_started'),
        type: 'turn_started',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'sdk',
        payload: {},
      }));
      const baseUserPayload = isJsonRecord(input.metadata)
        ? input.metadata
        : (isJsonRecord(input.payload) ? input.payload : {});
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'user_message'),
        type: 'user_message',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'ui',
        payload: {
          ...baseUserPayload,
          text: input.text,
        },
      }));
      const sourcePayload = isJsonRecord(input.payload) ? input.payload : {};
      const resources = input.resources ?? [];
      const resourceKinds = resources.map(resource => resource.kind);
      const resourceResolutionStartedAtMs = nowMs();
      await traceRecorder.record({
        path: 'query.resources',
        stage: 'resolve',
        status: 'started',
        data: {
          resourceCount: resources.length,
          resourceKinds,
          resolverRegisteredCount: this.options.resourceResolvers
            ? Object.keys(this.options.resourceResolvers).length
            : 0,
        },
      });
      let resourceResolution: TurnInputResourceResolutionResult;
      try {
        resourceResolution = await resolveTurnInputResources({
          resources: input.resources ?? null,
          resolvers: this.options.resourceResolvers ?? null,
          context: {
            text: input.text,
            conversationRef: this.options.conversationRef,
            turnRef,
            payload: sourcePayload,
            traceContext: traceRecorder.context(),
            emitTrace: async traceEvent => {
              await traceRecorder.record(traceEvent);
            },
          },
        });
        await traceRecorder.record({
          path: 'query.resources',
          stage: 'resolve',
          status: 'succeeded',
          durationMs: durationSince(resourceResolutionStartedAtMs),
          data: {
            resourceCount: resources.length,
            resourceKinds,
            payloadKeyCount: Object.keys(resourceResolution.payload).length,
            metadataKeyCount: Object.keys(resourceResolution.metadata).length,
          },
        });
      } catch (error) {
        await traceRecorder.record({
          path: 'query.resources',
          stage: 'resolve',
          status: 'failed',
          durationMs: durationSince(resourceResolutionStartedAtMs),
          error,
          data: {
            resourceCount: resources.length,
            resourceKinds,
          },
        });
        throw error;
      }
      const payloadForEnrichment = {
        ...sourcePayload,
        ...resourceResolution.payload,
      };
      const enrichedPayload = this.options.enrichQuery
        ? await this.options.enrichQuery({
          text: input.text,
          conversationRef: this.options.conversationRef,
          payload: payloadForEnrichment,
          emitDiagnostic: emitMemoryDiagnostic,
          traceContext: traceRecorder.context(),
          emitTrace: async traceEvent => {
            await traceRecorder.record(traceEvent);
          },
        })
        : payloadForEnrichment;
      const sdkAgentDefinition = isJsonRecord(this.options.agentDefinition)
        ? this.options.agentDefinition
        : null;
      const queryAgentDefinition = isJsonRecord(enrichedPayload.agent_definition)
        ? enrichedPayload.agent_definition
        : null;
      const mergedAgentDefinition = mergeQueryAgentDefinition(
        sdkAgentDefinition ?? undefined,
        queryAgentDefinition,
      );
      const transportPayload = mergedAgentDefinition
        ? {
          ...enrichedPayload,
          agent_definition: mergedAgentDefinition,
        }
        : enrichedPayload;
      for (const diagnostic of memoryDiagnostics) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(turnRef, 'memory_retrieval_diagnostic'),
          type: 'memory_retrieval_diagnostic',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload: {
            ...diagnostic,
          },
        }));
      }
      const metadataPayload = {
        ...resourceResolution.metadata,
        ...enrichedPayload,
      };
      const workspaceResources = resources.filter(resource => resource.kind === 'workspace');
      const workspacePathPresent = typeof enrichedPayload.workspace_path === 'string'
        ? enrichedPayload.workspace_path.trim().length > 0
        : typeof resourceResolution.payload.workspace_path === 'string'
          && resourceResolution.payload.workspace_path.trim().length > 0;
      await traceRecorder.record({
        path: 'workspace.context',
        stage: 'resolve',
        status: workspaceResources.length > 0 || workspacePathPresent ? 'succeeded' : 'skipped',
        data: {
          workspaceResourceCount: workspaceResources.length,
          hasWorkspacePath: workspacePathPresent,
          hasWorkspaceResource: workspaceResources.length > 0,
          sourceKind: workspaceResources.length > 0
            ? 'resource'
            : (workspacePathPresent ? 'payload' : 'none'),
        },
      });
      const agentDefinition = isJsonRecord(transportPayload.agent_definition)
        ? transportPayload.agent_definition
        : null;
      const mcpManifestStats = getMcpManifestToolStats(agentDefinition);
      const sdkMcpManifestStats = getMcpManifestToolStats(sdkAgentDefinition);
      const queryMcpManifestStats = getMcpManifestToolStats(queryAgentDefinition);
      await traceRecorder.record({
        path: 'agent.definition',
        stage: 'shape',
        status: agentDefinition ? 'succeeded' : 'skipped',
        data: {
          hasAgentDefinition: Boolean(agentDefinition),
          hasSdkAgentDefinition: Boolean(sdkAgentDefinition),
          hasQueryAgentDefinition: Boolean(queryAgentDefinition),
          toolCount: getAgentDefinitionToolCount(agentDefinition),
          sdkToolCount: getAgentDefinitionToolCount(sdkAgentDefinition),
          queryToolCount: getAgentDefinitionToolCount(queryAgentDefinition),
          pluginCount: arrayRecordCount(agentDefinition?.plugins),
          mcpCount: arrayRecordCount(agentDefinition?.mcps),
          mcpManifestToolCount: mcpManifestStats.toolCount,
          sdkMcpManifestToolCount: sdkMcpManifestStats.toolCount,
          queryMcpManifestToolCount: queryMcpManifestStats.toolCount,
          skillCount: arrayRecordCount(agentDefinition?.skills),
          capabilityRevision: getAgentDefinitionCapabilityRevision(agentDefinition),
          sdkCapabilityRevision: getAgentDefinitionCapabilityRevision(sdkAgentDefinition),
          queryCapabilityRevision: getAgentDefinitionCapabilityRevision(queryAgentDefinition),
          agentDefinitionKeyCount: recordKeyCount(agentDefinition),
          hasWorkspacePath: workspacePathPresent,
          hasLocalRuntime: Boolean(this.options.localRuntime),
        },
      });
      await traceRecorder.record({
        path: 'extension.load',
        stage: 'contribute',
        status: arrayRecordCount(agentDefinition?.plugins) > 0 ? 'succeeded' : 'skipped',
        data: {
          pluginCount: arrayRecordCount(agentDefinition?.plugins),
          hasAgentDefinition: Boolean(agentDefinition),
        },
      });
      await traceRecorder.record({
        path: 'mcp.tool',
        stage: 'contribute',
        status: mcpManifestStats.toolCount > 0 || arrayRecordCount(agentDefinition?.mcps) > 0
          ? 'succeeded'
          : 'skipped',
        data: {
          mcpServerCount: mcpManifestStats.serverCount || arrayRecordCount(agentDefinition?.mcps),
          mcpDefinitionCount: arrayRecordCount(agentDefinition?.mcps),
          mcpManifestToolCount: mcpManifestStats.toolCount,
          capabilityRevision: getAgentDefinitionCapabilityRevision(agentDefinition),
          hasAgentDefinition: Boolean(agentDefinition),
        },
      });
      if ((input.resources ?? []).some(resource => resource.kind === 'query_screenshot_request')) {
        await traceRecorder.record({
          path: 'screenshot.capture',
          stage: 'query_payload_applied',
          status: 'succeeded',
          data: {
            hasScreenshotRef: typeof enrichedPayload.screenshot_ref === 'string'
              && enrichedPayload.screenshot_ref.trim().length > 0,
            screenshotRefCount: Array.isArray(enrichedPayload.screenshot_refs)
              ? enrichedPayload.screenshot_refs.length
              : (typeof enrichedPayload.screenshot_ref === 'string' ? 1 : 0),
            hasCaptureMeta: isJsonRecord(enrichedPayload.capture_meta),
          },
        });
      }
      if (this.options.enrichQuery || hasOwnEnumerableKeys(resourceResolution.metadata)) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(turnRef, 'user_message_metadata'),
          type: 'user_message_metadata',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload: {
            ...metadataPayload,
            text: input.text,
          },
        }));
      }
      if (!this.options.transport) {
        await traceRecorder.record({
          path: 'query.dispatch',
          stage: 'transport_send',
          status: 'skipped',
          data: {
            reason: 'transport_unavailable',
            resourceCount: input.resources?.length ?? 0,
            payloadKeyCount: Object.keys(transportPayload).length,
            hasModelOverride: Boolean(input.model),
          },
        });
        queryMessageId = turnRef;
      } else {
        const dispatchStartedAtMs = nowMs();
        await traceRecorder.record({
          path: 'query.dispatch',
          stage: 'transport_send',
          status: 'started',
          data: {
            resourceCount: input.resources?.length ?? 0,
            payloadKeyCount: Object.keys(transportPayload).length,
            hasModelOverride: Boolean(input.model),
            hasConversationRef: true,
          },
        });
        try {
          const sentQueryMessageId = await this.options.transport.sendQuery({
            ...transportPayload,
            text: input.text,
            conversation_ref: this.options.conversationRef,
          }, {
            messageId: turnRef,
          });
          if (!sentQueryMessageId) {
            throw new Error('Failed to send query to backend');
          }
          await traceRecorder.record({
            path: 'query.dispatch',
            stage: 'transport_send',
            status: 'succeeded',
            requestId: sentQueryMessageId,
            durationMs: durationSince(dispatchStartedAtMs),
            data: {
              backendMessageId: sentQueryMessageId,
              backendAccepted: true,
            },
          });
          queryMessageId = sentQueryMessageId;
        } catch (error) {
          await traceRecorder.record({
            path: 'query.dispatch',
            stage: 'transport_send',
            status: 'failed',
            durationMs: durationSince(dispatchStartedAtMs),
            error,
            data: {
              backendAccepted: false,
            },
          });
          throw error;
        }
      }
    } catch (error) {
      this.pendingTurns.delete(turnRef);
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'turn_error'),
        type: 'turn_error',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'sdk',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          reason: 'send_failed',
        },
      }));
      throw error;
    }
    return { turnRef, queryMessageId };
  }

  async *stream(input: SendInput): AsyncIterable<AgentRuntimeEvent> {
    const queue: AgentRuntimeEvent[] = [];
    let finished = false;
    let notify: (() => void) | null = null;
    let sendError: unknown = null;
    const wake = () => {
      notify?.();
      notify = null;
    };
    const push = (event: AgentRuntimeEvent) => {
      if (finished) {
        return;
      }
      queue.push(event);
      if (event.type === 'conversation_event' && isTerminalConversationEvent(event.event)) {
        finished = true;
      }
      wake();
    };
    const next = async (): Promise<AgentRuntimeEvent | null> => {
      while (queue.length === 0 && !finished) {
        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
      return queue.shift() ?? null;
    };
    const unsubscribe = this.subscribeEvents((event, snapshot) => {
      push({ type: 'conversation_event', event, snapshot });
    });
    const sendPromise = this.send(input)
      .then(async result => {
        push({
          type: 'turn_started',
          result,
          snapshot: await this.load(),
        });
      })
      .catch(async error => {
        sendError = error;
        let snapshot: ConversationSnapshot | undefined;
        try {
          snapshot = await this.load();
        } catch {
          snapshot = undefined;
        }
        push({ type: 'error', error, snapshot });
        finished = true;
        wake();
      });
    try {
      while (true) {
        const event = await next();
        if (!event) {
          break;
        }
        yield event;
      }
      await sendPromise;
      if (sendError) {
        throw sendError;
      }
    } finally {
      finished = true;
      unsubscribe();
      wake();
    }
  }

  async editAndResend(input: EditAndResendInput): Promise<TurnResult> {
    const prepared = await this.prepareEditAndResend(input);
    return this.send(prepared);
  }

  async prepareEditAndResend(input: EditAndResendInput): Promise<PreparedReplayTurn> {
    const normalizedText = input.text.trim();
    if (!normalizedText) {
      throw new Error('editAndResend requires non-empty text');
    }
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const userIndex = events.findIndex(event => (
      event.type === 'user_message' && eventMatchesId(event, input.messageId)
    ));
    if (userIndex < 0) {
      throw new Error(`Cannot edit missing user message: ${input.messageId}`);
    }
    const replayPayload = mergeReplayPayload(
      resolvedUserTurnPayload(events, userIndex),
      input.payload,
    );
    replayPayload.text = normalizedText;
    await this.rewriteToRevision({
      events,
      preservedEvents: events.slice(0, userIndex),
      removedEvents: events.slice(userIndex),
      reason: 'edit_resend',
      replacementText: normalizedText,
    });
    await this.rehydrate();
    return {
      text: normalizedText,
      turnRef: input.turnRef,
      model: input.model,
      payload: replayPayload,
    };
  }

  async retryTurn(input: RetryTurnInput = {}): Promise<TurnResult> {
    const prepared = await this.prepareRetryTurn(input);
    return this.send(prepared);
  }

  async prepareRetryTurn(input: RetryTurnInput = {}): Promise<PreparedReplayTurn> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const targetIndex = input.messageId
      ? events.findIndex(event => eventMatchesId(event, input.messageId))
      : events.length - 1;
    if (input.messageId && targetIndex < 0) {
      throw new Error(`Cannot retry missing message: ${input.messageId}`);
    }
    const searchStart = targetIndex >= 0 ? targetIndex : events.length - 1;
    let userIndex = -1;
    for (let index = searchStart; index >= 0; index -= 1) {
      if (events[index]?.type === 'user_message') {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) {
      throw new Error('Cannot retry without a previous user message');
    }
    const retryText = eventText(events[userIndex]);
    if (!retryText.trim()) {
      throw new Error('Cannot retry a user message with empty text');
    }
    const replayPayload = mergeReplayPayload(
      resolvedUserTurnPayload(events, userIndex),
      input.payload,
    );
    replayPayload.text = retryText;
    await this.rewriteToRevision({
      events,
      preservedEvents: events.slice(0, userIndex),
      removedEvents: events.slice(userIndex),
      reason: 'retry',
      replacementText: retryText,
    });
    await this.rehydrate();
    return {
      text: retryText,
      turnRef: input.turnRef,
      model: input.model,
      payload: replayPayload,
    };
  }

  async stop(turnRef: string | null = this.state.activeTurnRef ?? null): Promise<void> {
    const startedAtMs = nowMs();
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(turnRef, 'turn_stopped'),
      type: 'turn_stopped',
      conversationRef: this.options.conversationRef,
      revisionId: this.state.revisionId,
      turnRef,
      source: 'ui',
      payload: {},
    }));
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'websocket.control',
        stage: 'send',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          messageType: 'stop-query',
          hasTurnRef: Boolean(turnRef),
        },
      }, { turnRef });
    } else {
      await this.recordRuntimeTrace({
        path: 'websocket.control',
        stage: 'send',
        status: 'started',
        data: {
          messageType: 'stop-query',
          hasTurnRef: Boolean(turnRef),
        },
      }, { turnRef });
      try {
        await this.options.transport.stop({
          conversation_ref: this.options.conversationRef,
          turn_ref: turnRef,
        });
        await this.recordRuntimeTrace({
          path: 'websocket.control',
          stage: 'send',
          status: 'succeeded',
          durationMs: durationSince(startedAtMs),
          data: {
            messageType: 'stop-query',
            hasTurnRef: Boolean(turnRef),
          },
        }, { turnRef });
      } catch (error) {
        await this.recordRuntimeTrace({
          path: 'websocket.control',
          stage: 'send',
          status: 'failed',
          durationMs: durationSince(startedAtMs),
          error,
          data: {
            messageType: 'stop-query',
            hasTurnRef: Boolean(turnRef),
          },
        }, { turnRef });
        throw error;
      }
    }
  }

  async rehydrate(): Promise<RehydrateSnapshot> {
    const startedAtMs = nowMs();
    const snapshot = await this.options.store.loadForRehydrate(this.options.conversationRef);
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          messageCount: snapshot.messages.length,
          rehydrateMode: 'replace',
        },
      });
      return snapshot;
    }
    await this.recordRuntimeTrace({
      path: 'conversation.rehydrate',
      stage: 'transport_send',
      status: 'started',
      data: {
        messageCount: snapshot.messages.length,
        rehydrateMode: 'replace',
      },
    });
    try {
      await this.options.transport.rehydrateConversation({
        conversation_ref: this.options.conversationRef,
        messages: snapshot.messages,
        rehydrate_mode: 'replace',
      });
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'succeeded',
        durationMs: durationSince(startedAtMs),
        data: {
          messageCount: snapshot.messages.length,
          rehydrateMode: 'replace',
        },
      });
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
        data: {
          messageCount: snapshot.messages.length,
          rehydrateMode: 'replace',
        },
      });
      throw error;
    }
    return snapshot;
  }

  async rehydrateMessages(payload: RehydratePayload): Promise<void> {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const startedAtMs = nowMs();
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          messageCount: messages.length,
          rehydrateMode: 'replace',
        },
      });
      return;
    }
    await this.recordRuntimeTrace({
      path: 'conversation.rehydrate',
      stage: 'transport_send',
      status: 'started',
      data: {
        messageCount: messages.length,
        rehydrateMode: 'replace',
      },
    });
    try {
      await this.options.transport.rehydrateConversation({
        ...payload,
        rehydrate_mode: 'replace',
      });
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'succeeded',
        durationMs: durationSince(startedAtMs),
        data: {
          messageCount: messages.length,
          rehydrateMode: 'replace',
        },
      });
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'conversation.rehydrate',
        stage: 'transport_send',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
        data: {
          messageCount: messages.length,
          rehydrateMode: 'replace',
        },
      });
      throw error;
    }
  }

  async compactHistory(input: CompactHistoryInput = {}): Promise<string | void> {
    const payload: CompactHistoryPayload = {
      ...(input.payload ?? {}),
      force: input.force ?? true,
      conversation_ref: this.options.conversationRef,
    };
    const startedAtMs = nowMs();
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'compaction.lifecycle',
        stage: 'request',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          force: payload.force,
          payloadKeyCount: Object.keys(payload).length,
        },
      });
      return undefined;
    }
    await this.recordRuntimeTrace({
      path: 'compaction.lifecycle',
      stage: 'request',
      status: 'started',
      data: {
        force: payload.force,
        payloadKeyCount: Object.keys(payload).length,
      },
    });
    try {
      const backendMessageId = await this.options.transport.compactHistory(payload);
      const requestId = optionalRequestId(backendMessageId);
      await this.recordRuntimeTrace({
        path: 'compaction.lifecycle',
        stage: 'request',
        status: 'succeeded',
        requestId,
        durationMs: durationSince(startedAtMs),
        data: {
          force: payload.force,
          backendMessageId: requestId,
        },
      });
      return backendMessageId;
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'compaction.lifecycle',
        stage: 'request',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
        data: {
          force: payload.force,
        },
      });
      throw error;
    }
  }

  async wakewordDetected(payload: WakewordPayload = {}): Promise<string | void> {
    const startedAtMs = nowMs();
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'wakeword.runtime',
        stage: 'activate',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          payloadKeyCount: Object.keys(payload).length,
        },
      });
      await this.recordRuntimeTrace({
        path: 'websocket.control',
        stage: 'send',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          messageType: 'wakeword-detected',
        },
      });
      return undefined;
    }
    await this.recordRuntimeTrace({
      path: 'wakeword.runtime',
      stage: 'activate',
      status: 'started',
      data: {
        payloadKeyCount: Object.keys(payload).length,
      },
    });
    await this.recordRuntimeTrace({
      path: 'websocket.control',
      stage: 'send',
      status: 'started',
      data: {
        messageType: 'wakeword-detected',
      },
    });
    try {
      const backendMessageId = await this.options.transport.wakewordDetected(payload);
      const requestId = optionalRequestId(backendMessageId);
      await this.recordRuntimeTrace({
        path: 'wakeword.runtime',
        stage: 'activate',
        status: 'succeeded',
        requestId,
        durationMs: durationSince(startedAtMs),
        data: {
          backendMessageId: requestId,
        },
      });
      await this.recordRuntimeTrace({
        path: 'websocket.control',
        stage: 'send',
        status: 'succeeded',
        requestId,
        durationMs: durationSince(startedAtMs),
        data: {
          messageType: 'wakeword-detected',
          backendMessageId: requestId,
        },
      });
      return backendMessageId;
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'wakeword.runtime',
        stage: 'activate',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
      });
      await this.recordRuntimeTrace({
        path: 'websocket.control',
        stage: 'send',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
        data: {
          messageType: 'wakeword-detected',
        },
      });
      throw error;
    }
  }

  async updateSettings(payload: SettingsPayload): Promise<string | void> {
    const updatedKeys = Object.keys(payload).sort();
    const startedAtMs = nowMs();
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'settings.sync',
        stage: 'update',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
          updatedKeys,
        },
      });
      return undefined;
    }
    await this.recordRuntimeTrace({
      path: 'settings.sync',
      stage: 'update',
      status: 'started',
      data: {
        updatedKeys,
      },
    });
    try {
      const backendMessageId = await this.options.transport.updateSettings(payload);
      const requestId = optionalRequestId(backendMessageId);
      await this.recordRuntimeTrace({
        path: 'settings.sync',
        stage: 'update',
        status: 'succeeded',
        requestId,
        durationMs: durationSince(startedAtMs),
        data: {
          updatedKeys,
          backendMessageId: requestId,
        },
      });
      return backendMessageId;
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'settings.sync',
        stage: 'update',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
        data: {
          updatedKeys,
        },
      });
      throw error;
    }
  }

  async requestModelList(): Promise<string | void> {
    const startedAtMs = nowMs();
    if (!this.options.transport) {
      await this.recordRuntimeTrace({
        path: 'model.catalog',
        stage: 'list',
        status: 'skipped',
        data: {
          reason: 'transport_unavailable',
        },
      });
      return undefined;
    }
    await this.recordRuntimeTrace({
      path: 'model.catalog',
      stage: 'list',
      status: 'started',
    });
    try {
      const backendMessageId = await this.options.transport.listModels();
      const requestId = optionalRequestId(backendMessageId);
      await this.recordRuntimeTrace({
        path: 'model.catalog',
        stage: 'list',
        status: 'succeeded',
        requestId,
        durationMs: durationSince(startedAtMs),
        data: {
          backendMessageId: requestId,
        },
      });
      return backendMessageId;
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'model.catalog',
        stage: 'list',
        status: 'failed',
        durationMs: durationSince(startedAtMs),
        error,
      });
      throw error;
    }
  }

  async ensureConnected(): Promise<void> {
    await this.options.transport?.connect();
  }

  async setModel(selection: AgentModelSelection): Promise<string | void> {
    if (!this.options.transport) {
      throw new Error('ConversationRuntime.setModel requires a backend transport');
    }
    const settings = buildModelSettingsPatch(selection, 'ConversationRuntime.setModel');
    const backendMessageId = await this.updateSettings(settings);
    const requestId = optionalRequestId(backendMessageId);
    const revisionId = this.state.revisionId === 'rev-empty'
      ? createRuntimeId('rev')
      : this.state.revisionId;
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(null, 'settings_updated'),
      type: 'settings_updated',
      conversationRef: this.options.conversationRef,
      revisionId,
      source: 'sdk',
      payload: {
        ...settings,
        backendMessageId: requestId,
      },
    }));
    return backendMessageId;
  }

  close(): void {
    this.detachTransport?.();
    this.detachTransport = undefined;
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private async rewriteToRevision({
    events,
    preservedEvents,
    removedEvents,
    reason,
    replacementText,
  }: {
    events: ConversationEvent[];
    preservedEvents: ConversationEvent[];
    removedEvents: ConversationEvent[];
    reason: 'edit_resend' | 'retry';
    replacementText: string;
  }): Promise<void> {
    const baseRevisionId = events[events.length - 1]?.revisionId ?? this.state.revisionId;
    const newRevisionId = createRuntimeId('rev');
    const rewriteEvent = createConversationEvent({
      eventId: this.nextLocalEventId(null, 'conversation_rewritten'),
      type: 'conversation_rewritten',
      conversationRef: this.options.conversationRef,
      revisionId: newRevisionId,
      source: 'sdk',
      payload: {
        baseRevisionId,
        reason,
        replacementUserMessage: {
          text: replacementText,
        },
        removedEventIds: removedEvents.map(event => event.eventId),
      },
    });
    const nextEvents = [...preservedEvents, rewriteEvent];
    this.events = nextEvents;
    await this.options.store.rewriteConversation({
      conversationRef: this.options.conversationRef,
      baseRevisionId,
      newRevisionId,
      cutAfterEventId: preservedEvents[preservedEvents.length - 1]?.eventId ?? null,
      replacementUserMessage: { text: replacementText },
      preservedEvents: nextEvents,
      removedEventIds: removedEvents.map(event => event.eventId),
      reason,
    });
    this.state = nextEvents.reduce(
      (state, event) => reduceConversationRuntimeState(state, event),
      createInitialConversationRuntimeState(this.options.conversationRef, newRevisionId),
    );
    this.events = await this.options.store.loadEvents(this.options.conversationRef);
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, rewriteEvent);
  }

  private async applyEvent(event: ConversationEvent): Promise<void> {
    this.events = [...this.events, event];
    this.state = reduceConversationRuntimeState(this.state, event);
    if ((event.type === 'turn_stopped' || event.type === 'turn_error') && event.turnRef) {
      this.pendingTurns.delete(event.turnRef);
    }
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, event);
    await this.options.store.appendEvent(event);
    await this.maybeExecuteTool(event);
  }

  private async recordRuntimeTrace(
    input: TraceEventInput,
    options: { turnRef?: string | null; revisionId?: string | null; traceId?: string | null } = {},
  ): Promise<TraceEventPayload> {
    const turnRef = options.turnRef ?? null;
    const revisionId = options.revisionId
      ?? (this.state.revisionId === 'rev-empty' ? createRuntimeId('rev') : this.state.revisionId);
    const traceRecorder = new TraceRecorder({
      conversationRef: this.options.conversationRef,
      turnRef,
      userId: this.options.userId ?? null,
      traceId: options.traceId ?? null,
      emit: async payload => {
        await this.applyEvent(createConversationEvent<TraceEventPayload>({
          eventId: this.nextLocalEventId(turnRef, 'trace_event'),
          type: 'trace_event',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload,
        }));
      },
    });
    return traceRecorder.record(input);
  }

  private async applyBackendTurnCompleted(event: ConversationEvent): Promise<void> {
    const assistantResponse = completedAssistantResponse(event);
    const pendingTurn = event.turnRef ? this.pendingTurns.get(event.turnRef) : undefined;
    this.events = [...this.events, event];
    this.state = reduceConversationRuntimeState(this.state, event);
    await this.options.store.appendEvent(event);
    try {
      await this.persistCompletedTurnMemory(event, pendingTurn, assistantResponse);
    } finally {
      if (pendingTurn) {
        this.pendingTurns.delete(pendingTurn.turnRef);
      }
    }
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, event);
    this.scheduleCompletedTurnTitleGeneration(event, pendingTurn, assistantResponse);
  }

  private async persistCompletedTurnMemory(
    event: ConversationEvent,
    pendingTurn: PendingTurn | undefined,
    assistantResponse: string,
  ): Promise<void> {
    if (!pendingTurn) {
      return;
    }
    if (!this.options.sdkClient) {
      return;
    }
    const memoryPersistenceStartedAtMs = nowMs();
    await this.recordRuntimeTrace({
      path: 'memory.persistence',
      stage: 'completed_turn',
      status: 'started',
      data: {
        memoryEnabled: this.options.memoryEnabled !== false,
        hasLocalRuntime: Boolean(this.options.localRuntime),
        hasSdkClient: Boolean(this.options.sdkClient),
        userQueryLength: pendingTurn.userText.trim().length,
        assistantResponseLength: assistantResponse.trim().length,
      },
    }, {
      turnRef: event.turnRef,
      revisionId: event.revisionId,
    });
    try {
      const result = await storeCompletedTurnMemory({
        localRuntime: this.options.localRuntime,
        sdkClient: this.options.sdkClient,
        userId: this.options.userId ?? 'local-sdk-user',
        conversationRef: event.conversationRef,
        userQuery: pendingTurn.userText,
        assistantResponse,
        memoryEnabled: this.options.memoryEnabled,
      });
      if (!result) {
        await this.recordRuntimeTrace({
          path: 'memory.persistence',
          stage: 'completed_turn',
          status: 'skipped',
          durationMs: durationSince(memoryPersistenceStartedAtMs),
          data: {
            reason: 'memory_disabled_or_unavailable',
            memoryEnabled: this.options.memoryEnabled !== false,
          },
        }, {
          turnRef: event.turnRef,
          revisionId: event.revisionId,
        });
        return;
      }
      await this.recordRuntimeTrace({
        path: 'memory.persistence',
        stage: 'completed_turn',
        status: 'succeeded',
        durationMs: durationSince(memoryPersistenceStartedAtMs),
        requestId: result.memoryId ?? null,
        data: {
          memoryTypes: ['episodic'],
          hasMemoryId: Boolean(result.memoryId),
        },
      }, {
        turnRef: event.turnRef,
        revisionId: event.revisionId,
      });
      await this.applyEvent(createConversationEvent<MemoryStoreChangedPayload>({
        eventId: this.nextLocalEventId(event.turnRef, 'memory_store_changed'),
        type: 'memory_store_changed',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          userId: this.options.userId ?? 'local-sdk-user',
          conversationRef: event.conversationRef,
          memoryTypes: ['episodic'],
          reason: 'completed_turn',
          memoryId: result.memoryId ?? null,
        },
      }));
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'memory.persistence',
        stage: 'completed_turn',
        status: 'failed',
        durationMs: durationSince(memoryPersistenceStartedAtMs),
        error,
        data: {
          memoryEnabled: this.options.memoryEnabled !== false,
        },
      }, {
        turnRef: event.turnRef,
        revisionId: event.revisionId,
      });
      console.warn(
        '[Agent SDK] Memory persistence failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private scheduleCompletedTurnTitleGeneration(
    event: ConversationEvent,
    pendingTurn: PendingTurn | undefined,
    assistantResponse: string,
  ): void {
    if (
      !pendingTurn
      || !this.options.sdkClient
      || typeof this.options.sdkClient.generateConversationTitle !== 'function'
      || !this.options.localRuntime?.rpc
    ) {
      return;
    }
    const userMessage = pendingTurn.userText.trim();
    const assistantMessage = assistantResponse.trim();
    if (!userMessage || !assistantMessage) {
      return;
    }
    if (this.hasPreviousAssistantText(event.turnRef)) {
      return;
    }
    const input: CompletedTurnTitleInput = {
      userId: this.options.userId ?? 'local-sdk-user',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      revisionId: event.revisionId,
      userMessage,
      assistantMessage,
      modelId: this.completedTurnModelId(event),
      modelProvider: this.completedTurnModelProvider(event),
    };
    const key = titleGenerationKey(input);
    if (completedTurnTitleGenerationInFlight.has(key)) {
      return;
    }
    completedTurnTitleGenerationInFlight.add(key);
    void this.generateCompletedTurnTitle(input)
      .catch(error => {
        console.warn(
          '[Agent SDK] Conversation title generation failed:',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        completedTurnTitleGenerationInFlight.delete(key);
      });
  }

  private hasPreviousAssistantText(currentTurnRef: string | null | undefined): boolean {
    return this.events.some(event => {
      if (currentTurnRef && event.turnRef === currentTurnRef) {
        return false;
      }
      if (event.type === 'assistant_message') {
        return eventText(event).trim().length > 0;
      }
      if (event.type === 'turn_completed') {
        return completedAssistantResponse(event).trim().length > 0;
      }
      return false;
    });
  }

  private async generateCompletedTurnTitle(input: CompletedTurnTitleInput): Promise<void> {
    const localRuntime = this.options.localRuntime;
    const sdkClient = this.options.sdkClient;
    if (!localRuntime?.rpc || !sdkClient || typeof sdkClient.generateConversationTitle !== 'function') {
      return;
    }
    const titleState = await this.traceLocalRuntimeRpc(localRuntime, {
      method: 'get_conversation_title_state',
      params: {
        user_id: input.userId,
        conversation_id: input.conversationRef,
      },
    }, {
      turnRef: input.turnRef ?? null,
      revisionId: input.revisionId ?? null,
    });
    if (!titleStateAllowsGeneratedTitle(titleState)) {
      return;
    }
    const titleGenerationStartedAtMs = nowMs();
    await this.recordRuntimeTrace({
      path: 'title.generation',
      stage: 'generate',
      status: 'started',
      data: {
        hasModelId: Boolean(input.modelId),
        modelProvider: input.modelProvider ?? null,
        userMessageLength: input.userMessage.length,
        assistantMessageLength: input.assistantMessage.length,
      },
    }, {
      turnRef: input.turnRef ?? null,
      revisionId: input.revisionId ?? null,
    });
    let response;
    try {
      response = await sdkClient.generateConversationTitle({
        user_id: input.userId,
        user_message: input.userMessage,
        assistant_message: input.assistantMessage,
        ...(input.modelId ? { model_id: input.modelId } : {}),
        ...(input.modelProvider ? { model_provider: input.modelProvider } : {}),
      });
    } catch (error) {
      await this.recordRuntimeTrace({
        path: 'title.generation',
        stage: 'generate',
        status: 'failed',
        durationMs: durationSince(titleGenerationStartedAtMs),
        error,
        data: {
          hasModelId: Boolean(input.modelId),
          modelProvider: input.modelProvider ?? null,
        },
      }, {
        turnRef: input.turnRef ?? null,
        revisionId: input.revisionId ?? null,
      });
      throw error;
    }
    if (response.success === false) {
      await this.recordRuntimeTrace({
        path: 'title.generation',
        stage: 'generate',
        status: 'failed',
        durationMs: durationSince(titleGenerationStartedAtMs),
        data: {
          success: false,
        },
        error: {
          code: 'title_generation_failed',
          message: 'Conversation title generation failed.',
        },
      }, {
        turnRef: input.turnRef ?? null,
        revisionId: input.revisionId ?? null,
      });
      return;
    }
    const title = typeof response.title === 'string' ? response.title.trim() : '';
    if (!title || title.toLowerCase() === 'new chat') {
      await this.recordRuntimeTrace({
        path: 'title.generation',
        stage: 'generate',
        status: 'skipped',
        durationMs: durationSince(titleGenerationStartedAtMs),
        data: {
          reason: 'empty_or_default_title',
        },
      }, {
        turnRef: input.turnRef ?? null,
        revisionId: input.revisionId ?? null,
      });
      return;
    }
    await this.recordRuntimeTrace({
      path: 'title.generation',
      stage: 'generate',
      status: 'succeeded',
      durationMs: durationSince(titleGenerationStartedAtMs),
      data: {
        success: true,
        titleLength: title.length,
      },
    }, {
      turnRef: input.turnRef ?? null,
      revisionId: input.revisionId ?? null,
    });
    const updateResult = await this.traceLocalRuntimeRpc(localRuntime, {
      method: 'update_conversation_title',
      params: {
        user_id: input.userId,
        conversation_id: input.conversationRef,
        title,
      },
    }, {
      turnRef: input.turnRef ?? null,
      revisionId: input.revisionId ?? null,
    });
    rpcResponseData(updateResult, 'Conversation title update RPC failed');
  }

  private async traceLocalRuntimeRpc(
    localRuntime: Pick<LocalRuntime, 'rpc'>,
    request: { method: string; params?: JsonRecord; id?: string | number },
    options: { turnRef?: string | null; revisionId?: string | null } = {},
  ): Promise<JsonRecord> {
    if (!localRuntime.rpc) {
      throw new Error('local runtime rpc is unavailable');
    }
    const startedAtMs = nowMs();
    const method = request.method;
    const params = isJsonRecord(request.params) ? request.params : {};
    await this.recordRuntimeTrace({
      path: LOCAL_RUNTIME_RPC_TRACE_PATH,
      stage: 'request',
      status: 'started',
      requestId: typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : method,
      data: {
        method,
        paramsKeyCount: Object.keys(params).length,
        hasParams: Object.keys(params).length > 0,
      },
    }, options);
    try {
      const response = await localRuntime.rpc(request);
      await this.recordRuntimeTrace({
        path: LOCAL_RUNTIME_RPC_TRACE_PATH,
        stage: 'request',
        status: 'succeeded',
        requestId: typeof request.id === 'string' || typeof request.id === 'number'
          ? String(request.id)
          : method,
        durationMs: durationSince(startedAtMs),
        data: {
          method,
          responseKeyCount: Object.keys(response).length,
          hasSuccessFlag: typeof response.success === 'boolean',
          ...(typeof response.success === 'boolean' ? { successFlag: response.success } : {}),
        },
      }, options);
      return response;
    } catch (error) {
      await this.recordRuntimeTrace({
        path: LOCAL_RUNTIME_RPC_TRACE_PATH,
        stage: 'request',
        status: 'failed',
        requestId: typeof request.id === 'string' || typeof request.id === 'number'
          ? String(request.id)
          : method,
        durationMs: durationSince(startedAtMs),
        data: {
          method,
        },
        error,
      }, options);
      throw error;
    }
  }

  private completedTurnModelId(event: ConversationEvent): string | undefined {
    return stringPayloadField(this.state.settings, 'selected_model_id', 'modelId', 'model_id')
      ?? stringPayloadField(event.payload, 'modelId', 'model_id', 'selected_model_id');
  }

  private completedTurnModelProvider(event: ConversationEvent): string | undefined {
    return stringPayloadField(this.state.settings, 'model_provider', 'modelProvider')
      ?? stringPayloadField(event.payload, 'modelProvider', 'model_provider');
  }

  private nextLocalEventId(turnRef: string | null | undefined, type: string): string {
    const scope = turnRef && turnRef.trim() ? turnRef.trim() : this.options.conversationRef;
    const next = (this.localEventCounters.get(scope) ?? 0) + 1;
    this.localEventCounters.set(scope, next);
    return `${scope}-sdk-evt-${next.toString().padStart(6, '0')}-${type}`;
  }

  private backendSequenceKey(event: ConversationEvent): string {
    return event.turnRef ?? `conversation:${event.conversationRef}`;
  }

  private enqueueBackendEvent(event: ConversationEvent): void {
    this.backendEventQueue = this.backendEventQueue
      .then(() => this.processNormalizedBackendEvent(event))
      .catch(error => {
        console.warn(
          '[Agent SDK] Backend event processing failed:',
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  private async processNormalizedBackendEvent(event: ConversationEvent): Promise<void> {
    if (event.source !== 'backend') {
      await this.applyEvent(event);
      return;
    }
    if (!this.shouldAcceptBackendEvent(event)) {
      return;
    }
    const sequence = typeof event.payload.backendSequence === 'number'
      ? event.payload.backendSequence
      : null;
    if (event.type === 'turn_error' && sequence === null) {
      await this.applyEvent(event);
      return;
    }
    if (!Number.isInteger(sequence) || (sequence ?? 0) <= 0) {
      await this.applyBackendSequenceError(event, {
        reason: 'missing_backend_sequence',
        error: 'Backend stream event missing producer sequence',
      });
      return;
    }

    const key = this.backendSequenceKey(event);
    const state = this.backendTurnSequences.get(key) ?? {
      lastSequence: 0,
      eventIds: new Set<string>(),
    };
    if (state.eventIds.has(event.eventId)) {
      return;
    }
    if (sequence <= state.lastSequence) {
      await this.applyBackendSequenceError(event, {
        reason: 'backend_sequence_regressed',
        error: `Backend stream sequence regressed from ${state.lastSequence} to ${sequence}`,
        lastSequence: state.lastSequence,
        receivedSequence: sequence,
      });
      return;
    }
    if (sequence > state.lastSequence + 1) {
      await this.applyBackendSequenceError(event, {
        reason: 'backend_sequence_gap',
        error: `Backend stream sequence gap before ${sequence}`,
        missing_sequence_start: state.lastSequence + 1,
        missing_sequence_end: sequence - 1,
        lastSequence: state.lastSequence,
        receivedSequence: sequence,
      });
    }
    state.eventIds.add(event.eventId);
    state.lastSequence = sequence;
    this.backendTurnSequences.set(key, state);
    const phaseBefore = this.state.phase;
    if (event.type === 'turn_completed') {
      await this.applyBackendTurnCompleted(event);
    } else {
      await this.applyEvent(event);
    }
    await this.recordOverlayPhaseTrace(event, phaseBefore);
  }

  private async recordOverlayPhaseTrace(
    event: ConversationEvent,
    phaseBefore: ConversationRuntimeState['phase'],
  ): Promise<void> {
    const phaseAfter = this.state.phase;
    if (phaseBefore === phaseAfter || event.type === 'trace_event') {
      return;
    }
    await this.recordRuntimeTrace({
      path: 'overlay.phase',
      stage: 'projection',
      status: 'succeeded',
      data: {
        sourceEventType: event.type,
        phaseBefore,
        phaseAfter,
        hasTurnRef: Boolean(event.turnRef),
        activeTurnMatches: event.turnRef ? event.turnRef === this.state.activeTurnRef : false,
      },
    }, {
      turnRef: event.turnRef,
      revisionId: event.revisionId,
    });
  }

  private async applyBackendSequenceError(
    event: ConversationEvent,
    payload: JsonRecord,
  ): Promise<void> {
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
      type: 'runtime_error',
      conversationRef: event.conversationRef,
      revisionId: event.revisionId,
      turnRef: event.turnRef,
      source: 'sdk',
      payload: {
        ...payload,
        sourceEventId: event.eventId,
        sourceEventType: event.type,
      },
    }));
  }

  private shouldAcceptBackendEvent(event: ConversationEvent): boolean {
    if (event.source !== 'backend') {
      return true;
    }
    if (event.conversationRef !== this.options.conversationRef) {
      this.logRejectedBackendEvent(event, 'conversation_ref_mismatch');
      return false;
    }
    if (
      !isConversationControlEvent(event)
      && this.state.stopState.requested
      && event.turnRef
      && (!this.state.stopState.turnRef || event.turnRef === this.state.stopState.turnRef)
      && event.type !== 'turn_completed'
      && event.type !== 'turn_error'
      && event.type !== 'runtime_error'
    ) {
      return false;
    }
    if (
      !isConversationControlEvent(event)
      && event.turnRef
      && this.state.activeTurnRef
      && event.turnRef !== this.state.activeTurnRef
    ) {
      this.logRejectedBackendEvent(event, 'active_turn_ref_mismatch');
      return false;
    }
    return true;
  }

  private logRejectedBackendEvent(event: ConversationEvent, reason: string): void {
    if (!isConversationControlEvent(event)) {
      return;
    }
    if (!isCompactionStdoutEnabled()) {
      return;
    }
    console.log('[Agent SDK][Compaction] backend event rejected', {
      reason,
      eventType: event.type,
      eventScope: getConversationEventScope(event),
      conversationRef: event.conversationRef,
      expectedConversationRef: this.options.conversationRef,
      turnRef: event.turnRef ?? null,
      activeTurnRef: this.state.activeTurnRef ?? null,
      phase: this.state.phase,
      eventId: event.eventId,
      backendSequence: typeof event.payload.backendSequence === 'number'
        ? event.payload.backendSequence
        : null,
    });
  }

  private notify(snapshot: ConversationSnapshot, event?: ConversationEvent): void {
    this.listeners.forEach(listener => listener(snapshot));
    if (event) {
      this.eventListeners.forEach(listener => listener(event, snapshot));
    }
  }

  private async maybeExecuteTool(event: ConversationEvent): Promise<void> {
    if (
      event.source !== 'backend'
      || (event.type !== 'tool_call' && event.type !== 'tool_bundle_call')
      || !this.options.localRuntime?.executeTool
      || !this.options.transport
    ) {
      return;
    }
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: this.options.localRuntime,
      localToolLifecycle: this.options.localToolLifecycle,
      agentDefinition: isJsonRecord(this.options.agentDefinition)
        ? this.options.agentDefinition
        : null,
      store: {
        appendEvent: async outputEvent => {
          await this.applyEvent(outputEvent);
        },
      },
      artifactUploader: this.options.sdkClient?.artifacts,
      emitTrace: async traceEvent => {
        await this.recordRuntimeTrace(traceEvent, {
          turnRef: event.turnRef,
          revisionId: event.revisionId,
        });
      },
      sendToolResult: async payload => this.options.transport!.sendToolResult(payload),
      sendToolBundleResult: async payload => this.options.transport!.sendToolBundleResult(payload),
    });
    try {
      const claim = await coordinator.execute(event);
      if (!claim.claimed) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
          type: 'runtime_error',
          conversationRef: event.conversationRef,
          revisionId: event.revisionId,
          turnRef: event.turnRef,
          source: 'sdk',
          payload: {
            error: `Malformed tool event: ${claim.reason ?? 'unclaimable-tool-event'}`,
            reason: 'malformed_tool_event',
            claimReason: claim.reason ?? null,
          },
        }));
      }
    } catch (error) {
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(event.turnRef, 'turn_error'),
        type: 'turn_error',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          reason: 'tool_result_delivery_failed',
        },
      }));
    }
  }

  private snapshot(events: ConversationEvent[]): ConversationSnapshot {
    const currentTurn = buildCurrentTurnProjection(events);
    return {
      state: this.state,
      display: buildDisplayConversation(events),
      displayRows: buildDisplayRows(events),
      rehydrate: buildRehydrateSnapshot(events),
      currentTurn,
    };
  }
}

export function createConversationRuntime(options: ConversationRuntimeOptions): SdkConversationRuntime {
  return new SdkConversationRuntime(options);
}
