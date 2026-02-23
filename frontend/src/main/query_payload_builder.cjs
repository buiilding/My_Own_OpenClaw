/**
 * Query payload builder utilities for IPC -> backend query messages.
 *
 * Keeps XML/content enrichment logic separate from transport/event handling.
 */

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatMemorySection(tagName, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return `<${tagName}>\nNone\n</${tagName}>`;
  }
  const sectionText = entries.map((entry) => `- ${escapeXml(entry)}`).join('\n');
  return `<${tagName}>\n${sectionText}\n</${tagName}>`;
}

function appendMemorySections(parts, memories = null) {
  parts.push(formatMemorySection('episodic_memory', memories?.episodic));
  parts.push(formatMemorySection('semantic_memory', memories?.semantic));
}

const INITIAL_SYSTEM_STATE_FIELDS = Object.freeze([
  'active_window',
  'mouse_position',
  'screen_resolution',
  'windows',
]);

const SEQUENTIAL_SYSTEM_STATE_FIELDS = Object.freeze([
  'active_window',
  'mouse_position',
  'screen_resolution',
]);

/**
 * Format system state as initial XML (with all windows and stats)
 */
function formatInitialStateXml(state) {
  const windows = state.windows || [];
  const windowsXml = windows.map((w) => `        <window>${escapeXml(w)}</window>`).join('\n');

  return `<system_context>
    <os_state>
        <active_window>${escapeXml(state.active_window || 'Unknown')}</active_window>
        <mouse_position>${escapeXml(state.mouse_position || 'Unknown')}</mouse_position>
        <screen_resolution>${escapeXml(state.screen_resolution || 'Unknown')}</screen_resolution>
        <all_open_windows>
${windowsXml}
        </all_open_windows>
    </os_state>
</system_context>`;
}

/**
 * Format system state as sequential XML (minimal)
 */
function formatSequentialStateXml(state) {
  return `<system_context>
    <os_state>
        <active_window>${escapeXml(state.active_window || 'Unknown')}</active_window>
        <mouse_position>${escapeXml(state.mouse_position || 'Unknown')}</mouse_position>
    </os_state>
</system_context>`;
}

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

/**
 * Format fallback system state XML
 */
function formatFallbackStateXml() {
  return `<system_context>
    <os_state>
        <active_window>Unknown</active_window>
    </os_state>
</system_context>`;
}

function getRequestedSystemStateFields(contextType) {
  return contextType === 'initial'
    ? INITIAL_SYSTEM_STATE_FIELDS
    : SEQUENTIAL_SYSTEM_STATE_FIELDS;
}

function formatContextStateXml(contextType, state) {
  return contextType === 'initial'
    ? formatInitialStateXml(state)
    : formatSequentialStateXml(state);
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
    const systemStateXml = formatContextStateXml(contextType, state);
    logger('System state added to message');
    return {
      systemStateXml: systemStateXml.trim(),
      runtimeSystemState: extractQueryRuntimeSystemState(state),
    };
  } catch (error) {
    logger(`ERROR: System state enrichment failed: ${error?.message || 'Unknown error'}`);
    logger('Using fallback system context');
    return {
      systemStateXml: formatFallbackStateXml(),
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
    const memoryData = await searchMemory(text, userId, 5, null, conversationRef);
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

async function buildQueryPayloadContent({
  text,
  conversationRef,
  userId,
  contextType,
  getSystemState,
  searchMemory,
  log,
}) {
  const logger = typeof log === 'function' ? log : () => {};

  try {
    logger('Building complete user message with system state and memories...');

    const [stateEnrichment, memories] = await Promise.all([
      resolveSystemStateEnrichment({
        contextType,
        getSystemState,
        logger,
      }),
      resolveMemoryEnrichment({
        text,
        userId,
        conversationRef,
        searchMemory,
        logger,
      }),
    ]);

    const parts = [];
    const runtimeSystemState = stateEnrichment.runtimeSystemState || null;
    parts.push(stateEnrichment.systemStateXml);

    if (memories) {
      appendMemorySections(parts, memories);
    } else {
      appendMemorySections(parts);
    }

    parts.push(`<user_query>\n${escapeXml(text)}\n</user_query>`);

    return {
      content: parts.join('\n\n'),
      runtimeSystemState,
    };
  } catch (error) {
    logger(`ERROR: Failed to build user message: ${error.message}`);
    logger('Using fallback system context in error handler');
    return {
      content: `${formatFallbackStateXml()}\n\n<user_query>\n${escapeXml(text)}\n</user_query>`,
      runtimeSystemState: null,
    };
  }
}

module.exports = {
  buildQueryPayloadContent,
};
