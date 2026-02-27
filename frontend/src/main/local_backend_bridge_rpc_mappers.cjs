function getPayloadObject(payload = {}) {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  return {};
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

    return mapped;
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
});

const COMPILED_RPC_HANDLER_DEFINITIONS = [
  {
    channel: 'search-conversations',
    method: 'search_conversations',
    mapParams: createPayloadMapper({
      query: 'query',
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'list-conversations',
    method: 'list_conversations',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
      record_kind: 'recordKind',
    }),
  },
  {
    channel: 'list-episodic-memories',
    method: 'list_episodic_memories',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'get-conversation',
    method: 'get_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      limit: 'limit',
      record_kind: 'recordKind',
      after_message_index: 'afterMessageIndex',
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
    channel: 'delete-conversation',
    method: 'delete_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      record_kind: 'recordKind',
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
    channel: 'store-memory',
    method: 'store_memory',
    mapParams: createPayloadMapper({
      user_query: 'userQuery',
      assistant_response: 'assistantResponse',
      memory_type: 'memoryType',
      user_id: 'userId',
      session_id: 'sessionId',
    }),
  },
  {
    channel: 'store-transcript',
    method: 'store_transcript',
    mapParams: createPayloadMapper({
      content: 'content',
      user_id: 'userId',
      conversation_ref: 'conversationRef',
      role: 'role',
      message_type: 'messageType',
      tool_name: 'toolName',
      correlation_id: 'correlationId',
      message_index: 'messageIndex',
      model_id: 'modelId',
      model_provider: 'modelProvider',
      screenshot: 'screenshot',
      timestamp: 'timestamp',
    }),
  },
];

module.exports = {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  registerMappedRpcHandlers,
};
