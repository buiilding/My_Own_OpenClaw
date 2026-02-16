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

function logMemoryFailure(memoryResponse, log) {
  if (memoryResponse.status === 'rejected') {
    log(`Memory enrichment failed: ${memoryResponse.reason?.message || 'Unknown error'}`);
    return;
  }
  if (memoryResponse.status === 'fulfilled') {
    const data = memoryResponse.value;
    log(`Memory response structure: success=${data?.success}, hasData=${!!data?.data}, hasMemories=${!!data?.data?.memories}`);
    if (data && !data.data?.memories) {
      log(`Memory data keys: ${Object.keys(data).join(', ')}`);
      if (data.data) {
        log(`Memory data keys: ${Object.keys(data.data).join(', ')}`);
      }
    }
    return;
  }
  log(`Memory response status: ${memoryResponse.status}`);
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

    const memoryPromise = searchMemory(text, userId, 5, null, conversationRef).catch((err) => {
      logger(`Memory search failed: ${err.message}`);
      return { success: false, data: { memories: { episodic: [], semantic: [] } } };
    });

    const requestedFields = contextType === 'initial'
      ? ['active_window', 'mouse_position', 'screen_resolution', 'windows']
      : ['active_window', 'mouse_position', 'screen_resolution'];

    const statePromise = getSystemState(requestedFields).then((state) => ({
      systemStateXml: contextType === 'initial'
        ? formatInitialStateXml(state)
        : formatSequentialStateXml(state),
      runtimeSystemState: extractQueryRuntimeSystemState(state),
    }));

    const [stateResponse, memoryResponse] = await Promise.allSettled([
      statePromise,
      memoryPromise,
    ]);

    const parts = [];
    let runtimeSystemState = null;

    if (stateResponse.status === 'fulfilled' && stateResponse.value) {
      const systemStateXml = stateResponse.value.systemStateXml;
      runtimeSystemState = stateResponse.value.runtimeSystemState || null;
      parts.push(systemStateXml.trim());
      logger('System state added to message');
    } else {
      const errorMsg = stateResponse.status === 'rejected'
        ? stateResponse.reason?.message || 'Unknown error'
        : 'No system state data in response';
      logger(`ERROR: System state enrichment failed: ${errorMsg}`);
      parts.push(formatFallbackStateXml());
      logger('Using fallback system context');
    }

    const responseData = memoryResponse.status === 'fulfilled' ? memoryResponse.value : null;
    if (responseData?.success && responseData?.data?.memories) {
      const memories = responseData.data.memories;
      logger(`Memory response received - episodic: ${memories.episodic?.length || 0}, semantic: ${memories.semantic?.length || 0}`);
      appendMemorySections(parts, memories);
      logger('Memories added to message');
    } else {
      logMemoryFailure(memoryResponse, logger);
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
  escapeXml,
  formatMemorySection,
  appendMemorySections,
  formatInitialStateXml,
  formatSequentialStateXml,
  extractQueryRuntimeSystemState,
  formatFallbackStateXml,
};
