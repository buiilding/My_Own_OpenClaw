function getPayloadObject(payload = {}) {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  return {};
}

const MOJIBAKE_REPLACEMENTS = [
  ['â€œ', '“'],
  ['â€\u009d', '”'],
  ['â€˜', '‘'],
  ['â€™', '’'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€¦', '…'],
  ['â€¢', '•'],
  ['Â ', ' '],
  ['Â', ''],
];

function replaceLoneSurrogates(value) {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    const isHighSurrogate = codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
    const isLowSurrogate = codeUnit >= 0xDC00 && codeUnit <= 0xDFFF;

    if (!isHighSurrogate && !isLowSurrogate) {
      normalized += value[index];
      continue;
    }

    if (isHighSurrogate) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      const nextIsLowSurrogate = nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF;
      if (nextIsLowSurrogate) {
        normalized += value[index] + value[index + 1];
        index += 1;
        continue;
      }
    }

    normalized += '\uFFFD';
  }

  return normalized;
}

function normalizeTextValue(value) {
  if (typeof value !== 'string') {
    return value;
  }
  let repaired = value;
  for (const [needle, replacement] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(needle).join(replacement);
  }
  return replaceLoneSurrogates(repaired);
}

function sanitizePayloadValue(value) {
  if (typeof value === 'string') {
    return normalizeTextValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizePayloadValue(item)]),
    );
  }
  return value;
}

function createPayloadMapper(fieldMap) {
  const compiledMappings = Object.entries(fieldMap).map(([targetKey, mapping]) => {
    if (typeof mapping === 'function') {
      return {
        targetKey,
        mapperType: 'function',
        mapping,
      };
    }
    if (Array.isArray(mapping)) {
      return {
        targetKey,
        mapperType: 'fallback',
        sourceKeys: mapping,
      };
    }
    return {
      targetKey,
      mapperType: 'direct',
      sourceKey: mapping,
    };
  });

  return (payload) => {
    const source = getPayloadObject(payload);
    const mapped = {};

    for (const compiled of compiledMappings) {
      if (compiled.mapperType === 'function') {
        mapped[compiled.targetKey] = compiled.mapping(source);
        continue;
      }
      if (compiled.mapperType === 'fallback') {
        let resolved;
        for (const sourceKey of compiled.sourceKeys) {
          if (source[sourceKey] !== undefined) {
            resolved = source[sourceKey];
            break;
          }
        }
        mapped[compiled.targetKey] = resolved;
        continue;
      }
      mapped[compiled.targetKey] = source[compiled.sourceKey];
    }

    return sanitizePayloadValue(mapped);
  };
}

function registerMappedRpcHandlers(registerRpcHandler, definitions) {
  for (const { channel, method, mapParams } of definitions) {
    registerRpcHandler(channel, method, mapParams);
  }
}

const mapSearchMemoryPayload = createPayloadMapper({
  query: 'query',
  user_id: 'user_id',
  limit: 'limit',
  memory_type: 'memory_type',
  exclude_conversation_id: ['excludeConversationId', 'exclude_conversation_id'],
  episodic_limit: ['episodicLimit', 'episodic_limit'],
  semantic_limit: ['semanticLimit', 'semantic_limit'],
  semantic_min_score: ['semanticMinScore', 'semantic_min_score'],
});

const mapStoreMemoryPayload = createPayloadMapper({
  user_query: ['user_query', 'userQuery'],
  assistant_response: ['assistant_response', 'assistantResponse'],
  memory_type: ['memory_type', 'memoryType'],
  user_id: ['user_id', 'userId'],
  session_id: ['session_id', 'sessionId'],
});

const mapChatEventWritePayload = createPayloadMapper({
  user_id: 'userId',
  conversation_id: 'conversationId',
  event_type: 'eventType',
  role: 'role',
  content: 'content',
  timestamp: 'timestamp',
  message_index: 'messageIndex',
  revision_id: 'revisionId',
  turn_ref: 'turnRef',
  tool_name: 'toolName',
  correlation_id: 'correlationId',
  workspace_path: 'workspacePath',
  workspace_name: 'workspaceName',
  metadata: 'metadata',
  attachments: 'attachments',
  event_payload: 'eventPayload',
  compaction_checkpoint: 'compactionCheckpoint',
});

const COMPILED_RPC_HANDLER_DEFINITIONS = [
  {
    channel: 'list-episodic-memories',
    method: 'list_episodic_memories',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'list-semantic-memories',
    method: 'list_semantic_memories',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'delete-episodic-memory',
    method: 'delete_episodic_memory',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      memory_id: 'memoryId',
    }),
  },
  {
    channel: 'delete-semantic-memory',
    method: 'delete_semantic_memory',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      memory_id: 'memoryId',
    }),
  },
  {
    channel: 'clear-local-memory',
    method: 'clear_local_memory',
    mapParams: createPayloadMapper({
      user_id: 'userId',
    }),
  },
  {
    channel: 'clear-chat-history',
    method: 'clear_chat_history',
    mapParams: createPayloadMapper({
      user_id: 'userId',
    }),
  },
  {
    channel: 'store-chat-event',
    method: 'store_chat_event',
    mapParams: mapChatEventWritePayload,
  },
  {
    channel: 'replace-chat-conversation',
    method: 'replace_chat_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      revision_id: 'revisionId',
      revision_updated_at: 'revisionUpdatedAt',
      events: ({ events }) => (
        Array.isArray(events) ? events.map(mapChatEventWritePayload) : []
      ),
    }),
  },
  {
    channel: 'list-chat-conversations',
    method: 'list_chat_conversations',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'search-chat-conversations',
    method: 'search_chat_conversations',
    mapParams: createPayloadMapper({
      query: 'query',
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'get-chat-events',
    method: 'get_chat_events',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      limit: 'limit',
      after_message_index: 'afterMessageIndex',
    }),
  },
  {
    channel: 'get-chat-conversation-revision',
    method: 'get_chat_conversation_revision',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
    }),
  },
  {
    channel: 'delete-chat-conversation',
    method: 'delete_chat_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
    }),
  },
  {
    channel: 'store-memory',
    method: 'store_memory',
    mapParams: mapStoreMemoryPayload,
  },
];

module.exports = {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  mapStoreMemoryPayload,
  registerMappedRpcHandlers,
};
