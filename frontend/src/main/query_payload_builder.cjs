/**
 * Query payload builder utilities for IPC -> backend query messages.
 *
 * Electron main collects local context. Backend owns final model-visible prompt
 * formatting.
 */

const PROMPT_MEMORY_RETRIEVAL = Object.freeze({
  combinedLimit: 6,
  episodicLimit: 4,
  semanticLimit: 2,
  semanticMinScore: 0.2,
});

const INITIAL_SYSTEM_STATE_FIELDS = Object.freeze([
  'active_window',
  'mouse_position',
  'screen_resolution',
]);

const SEQUENTIAL_SYSTEM_STATE_FIELDS = Object.freeze([
  'active_window',
  'mouse_position',
  'screen_resolution',
]);

function extractQueryRuntimeSystemState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const resolution = typeof state.screen_resolution === 'string'
    ? state.screen_resolution.trim()
    : '';
  if (!resolution) {
    return null;
  }
  return {
    screen_resolution: resolution,
  };
}

function getRequestedSystemStateFields(contextType) {
  return contextType === 'initial'
    ? INITIAL_SYSTEM_STATE_FIELDS
    : SEQUENTIAL_SYSTEM_STATE_FIELDS;
}

function logMemoryFailure(memoryData, log) {
  log(`Memory response structure: success=${memoryData?.success}, hasData=${!!memoryData?.data}, hasMemories=${!!memoryData?.data?.memories}`);
  if (memoryData && !memoryData.data?.memories) {
    log(`Memory data keys: ${Object.keys(memoryData).join(', ')}`);
    if (memoryData.data) {
      log(`Memory data keys: ${Object.keys(memoryData.data).join(', ')}`);
    }
  }
}

async function resolveSystemStateEnrichment({
  contextType,
  getSystemState,
  logger,
}) {
  const requestedFields = getRequestedSystemStateFields(contextType);
  try {
    const state = await getSystemState(requestedFields);
    logger('System state captured for backend runtime metadata');
    return {
      runtimeSystemState: extractQueryRuntimeSystemState(state),
    };
  } catch (error) {
    logger(`ERROR: System state capture failed: ${error?.message || 'Unknown error'}`);
    return {
      runtimeSystemState: null,
    };
  }
}

async function resolveMemoryEnrichment({
  text,
  userId,
  conversationRef,
  searchMemory,
  logger,
}) {
  try {
    const memoryData = await searchMemory(
      text,
      userId,
      PROMPT_MEMORY_RETRIEVAL.combinedLimit,
      null,
      conversationRef,
      {
        episodic_limit: PROMPT_MEMORY_RETRIEVAL.episodicLimit,
        semantic_limit: PROMPT_MEMORY_RETRIEVAL.semanticLimit,
        semantic_min_score: PROMPT_MEMORY_RETRIEVAL.semanticMinScore,
      },
    );
    if (memoryData?.success && memoryData?.data?.memories) {
      const memories = memoryData.data.memories;
      logger(`Memory response received - episodic: ${memories.episodic?.length || 0}, semantic: ${memories.semantic?.length || 0}`);
      logger('Memories added to message');
      return memories;
    }
    logMemoryFailure(memoryData, logger);
    return null;
  } catch (error) {
    logger(`Memory search failed: ${error.message}`);
    return null;
  }
}

async function buildQueryPayloadContext({
  text,
  conversationRef,
  userId,
  contextType,
  attachmentContext = null,
  getSystemState,
  searchMemory,
  memoryRetrievalEnabled = true,
  log,
}) {
  const logger = typeof log === 'function' ? log : () => {};
  const shouldInjectMemories = memoryRetrievalEnabled !== false;

  try {
    logger('Building structured query context...');

    const [stateEnrichment, memories] = await Promise.all([
      resolveSystemStateEnrichment({
        contextType,
        getSystemState,
        logger,
      }),
      shouldInjectMemories
        ? resolveMemoryEnrichment({
          text,
          userId,
          conversationRef,
          searchMemory,
          logger,
        })
        : Promise.resolve(null),
    ]);

    const runtimeSystemState = stateEnrichment.runtimeSystemState || null;
    const queryContext = {
      memory_retrieval_enabled: shouldInjectMemories,
    };

    if (shouldInjectMemories) {
      if (memories) {
        queryContext.memories = {
          episodic: Array.isArray(memories.episodic) ? memories.episodic : [],
          semantic: Array.isArray(memories.semantic) ? memories.semantic : [],
        };
      } else {
        queryContext.memories = null;
      }
    } else {
      logger('Memory retrieval injection disabled; backend will skip memory prompt tags');
    }

    if (typeof attachmentContext === 'string' && attachmentContext.trim().length > 0) {
      queryContext.attachment_context = attachmentContext;
    }

    return {
      queryContext,
      runtimeSystemState,
    };
  } catch (error) {
    logger(`ERROR: Failed to build query context: ${error.message}`);
    return {
      queryContext: {
        memory_retrieval_enabled: shouldInjectMemories,
        memories: shouldInjectMemories ? null : undefined,
      },
      runtimeSystemState: null,
    };
  }
}

module.exports = {
  buildQueryPayloadContext,
};
