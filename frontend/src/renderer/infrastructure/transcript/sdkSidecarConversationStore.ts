import {
  SidecarConversationStore,
  type SidecarConversationStoreEventWriteParams,
  type JsonRecord,
} from '../api/windieSdkClient';
import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const RPC_METHOD_CHANNELS = {
  store_chat_event: INVOKE_CHANNELS.STORE_CHAT_EVENT,
  replace_chat_conversation: INVOKE_CHANNELS.REPLACE_CHAT_CONVERSATION,
  list_chat_conversations: INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS,
  search_chat_conversations: INVOKE_CHANNELS.SEARCH_CHAT_CONVERSATIONS,
  get_chat_events: INVOKE_CHANNELS.GET_CHAT_EVENTS,
  get_chat_conversation_revision: INVOKE_CHANNELS.GET_CHAT_CONVERSATION_REVISION,
  delete_chat_conversation: INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION,
} as const;

type SupportedRpcMethod = keyof typeof RPC_METHOD_CHANNELS;

type InvokeFunction = typeof IpcBridge.invoke;

function isSupportedRpcMethod(method: string): method is SupportedRpcMethod {
  return Object.prototype.hasOwnProperty.call(RPC_METHOD_CHANNELS, method);
}

function normalizePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function chatEventWriteToIpcPayload(params: JsonRecord = {}): JsonRecord {
  return {
    userId: params.user_id,
    conversationId: params.conversation_id,
    eventType: params.event_type,
    role: params.role,
    content: params.content,
    timestamp: params.timestamp,
    messageIndex: params.message_index,
    revisionId: params.revision_id,
    turnRef: params.turn_ref,
    toolName: params.tool_name,
    correlationId: params.correlation_id,
    workspacePath: params.workspace_path,
    workspaceName: params.workspace_name,
    metadata: params.metadata,
    attachments: params.attachments,
    eventPayload: params.event_payload,
    compactionCheckpoint: params.compaction_checkpoint,
  };
}

function toIpcPayload(method: SupportedRpcMethod, params: JsonRecord = {}): JsonRecord {
  switch (method) {
    case 'store_chat_event':
      return chatEventWriteToIpcPayload(params);
    case 'replace_chat_conversation':
      return {
        userId: params.user_id,
        conversationId: params.conversation_id,
        recordKind: params.record_kind,
        revisionId: params.revision_id,
        revisionUpdatedAt: params.revision_updated_at,
        events: Array.isArray(params.events)
          ? params.events
            .filter((event): event is JsonRecord => (
              Boolean(event) && typeof event === 'object' && !Array.isArray(event)
            ))
            .map(event => chatEventWriteToIpcPayload(event))
          : [],
      };
    case 'list_chat_conversations':
      return {
        userId: params.user_id,
        recordKind: params.record_kind,
        limit: normalizePositiveNumber(params.limit),
      };
    case 'search_chat_conversations':
      return {
        userId: params.user_id,
        recordKind: params.record_kind,
        query: params.query,
        limit: normalizePositiveNumber(params.limit),
      };
    case 'get_chat_events':
      return {
        userId: params.user_id,
        conversationId: params.conversation_id,
        recordKind: params.record_kind,
        limit: normalizePositiveNumber(params.limit),
        afterMessageIndex: params.after_message_index,
      };
    case 'get_chat_conversation_revision':
      return {
        userId: params.user_id,
        conversationId: params.conversation_id,
        recordKind: params.record_kind,
      };
    case 'delete_chat_conversation':
      return {
        userId: params.user_id,
        conversationId: params.conversation_id,
        recordKind: params.record_kind,
      };
    default:
      return params;
  }
}

export function createIpcSidecarConversationStore(
  userId: string,
  invoke: InvokeFunction = IpcBridge.invoke,
  options: {
    eventWriteParams?: SidecarConversationStoreEventWriteParams;
  } = {},
): SidecarConversationStore {
  return new SidecarConversationStore({
    userId,
    eventWriteParams: options.eventWriteParams,
    runtime: {
      rpc: async ({ method, params = {} }) => {
        if (!isSupportedRpcMethod(method)) {
          throw new Error(`Unsupported desktop conversation store RPC method: ${method}`);
        }
        return invoke(
          RPC_METHOD_CHANNELS[method],
          toIpcPayload(method, params),
        );
      },
    },
  });
}
