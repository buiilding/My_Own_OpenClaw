function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAttachmentFilenames(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((filename) => typeof filename === 'string' && filename.trim().length > 0)
    .map((filename) => filename.trim());
}

function normalizeQueryMessageId(value) {
  return normalizeOptionalString(value);
}

const BACKEND_QUERY_PAYLOAD_KEYS = Object.freeze([
  'text',
  'conversation_ref',
  'content',
  'screenshot',
  'screenshot_ref',
  'screenshot_refs',
  'capture_meta',
  'system_state_internal',
  'query_context',
  'workspace_path',
  'repo_instruction_messages',
  'client_prompt_layers',
  'agent_definition',
]);

function buildBackendQueryPayload(input) {
  const source = (
    input && typeof input === 'object' && !Array.isArray(input)
  ) ? input : {};
  const payload = {};
  for (const key of BACKEND_QUERY_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      payload[key] = source[key];
    }
  }
  return payload;
}

function prepareRendererQueryPayload(payload, currentConversationRef, resolveConversationRef) {
  const nextPayload = (
    payload && typeof payload === 'object' && !Array.isArray(payload)
  ) ? { ...payload } : {};
  const attachmentContext = (
    typeof nextPayload.attachment_context === 'string' && nextPayload.attachment_context.trim().length > 0
  ) ? nextPayload.attachment_context : null;
  const normalizedAttachmentFilenames = normalizeAttachmentFilenames(nextPayload.attachment_filenames);
  const queryMessageId = normalizeQueryMessageId(
    nextPayload.query_message_id || nextPayload.queryMessageId,
  );

  delete nextPayload.query_message_id;
  delete nextPayload.queryMessageId;
  delete nextPayload.turn_ref;
  delete nextPayload.turnRef;

  if (normalizedAttachmentFilenames.length > 0) {
    nextPayload.attachment_filenames = normalizedAttachmentFilenames;
  } else {
    delete nextPayload.attachment_filenames;
  }

  delete nextPayload.attachment_context;
  const memoryRetrievalEnabled = nextPayload.memory_retrieval_enabled !== false;
  delete nextPayload.memory_retrieval_enabled;

  const conversationRef = resolveConversationRef(nextPayload, currentConversationRef);
  if (!conversationRef) {
    throw new Error('Renderer query requires explicit conversation_ref');
  }
  if (!nextPayload.conversation_ref && conversationRef) {
    nextPayload.conversation_ref = conversationRef;
  }

  return {
    payload: nextPayload,
    attachmentContext,
    conversationRef,
    memoryRetrievalEnabled,
    queryMessageId,
  };
}

async function buildQueryPayload({
  basePayload,
  text,
  conversationRef,
  currentUserId,
  isFirstQuery,
  attachmentContext = null,
  memoryRetrievalEnabled = true,
  buildQueryPayloadContext,
  getSystemState,
  searchMemory,
  log,
}) {
  const contextType = isFirstQuery ? 'initial' : 'sequential';
  const userId = typeof currentUserId === 'string' ? currentUserId.trim() : '';
  if (!userId) {
    throw new Error('buildQueryPayload requires an authenticated user id');
  }
  const {
    queryContext,
    runtimeSystemState,
  } = await buildQueryPayloadContext({
    text,
    conversationRef,
    userId,
    contextType,
    attachmentContext,
    getSystemState,
    searchMemory,
    memoryRetrievalEnabled,
    log,
  });

  const payload = { ...basePayload, query_context: queryContext };
  if (runtimeSystemState) {
    payload.system_state_internal = runtimeSystemState;
  } else {
    delete payload.system_state_internal;
  }

  return {
    payload: buildBackendQueryPayload(payload),
    userId,
    conversationRef,
    queryUsedInitialContext: contextType === 'initial',
  };
}

function prepareAutomatedQueryPayload(options) {
  const text = normalizeOptionalString(options.text);
  if (!text) {
    return null;
  }

  const conversationRef = normalizeOptionalString(options.conversationRef)
    || null;

  return {
    text,
    conversationRef,
    attachmentContext: normalizeOptionalString(options.attachmentContext),
    attachmentFilenames: normalizeAttachmentFilenames(options.attachmentFilenames),
    memoryRetrievalEnabled: options.memoryRetrievalEnabled !== false,
  };
}

module.exports = {
  BACKEND_QUERY_PAYLOAD_KEYS,
  buildBackendQueryPayload,
  buildQueryPayload,
  normalizeQueryMessageId,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
};
